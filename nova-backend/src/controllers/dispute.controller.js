// ============================================================
// NOVA Platform — Dispute Controller
// Full dispute lifecycle: open, evidence, review, resolve
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const { DisputeStateMachineService } = require('../services/disputeStateMachine');
const { sendDisputeOpenedEmail } = require('../services/email.service');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const config = require('../config/env');

// ---- Validators ----
exports.createValidators = [
    body('orderId').isUUID().withMessage('Valid order ID required'),
    body('reason').isIn([
        'non_delivery', 'quality_issue', 'wrong_item',
        'payment_dispute', 'breach_of_contract', 'delivery_delay', 'other',
    ]).withMessage('Invalid dispute reason'),
    body('description').trim().isLength({ min: 20, max: 5000 })
        .withMessage('Description required (20-5000 chars)'),
    body('disputedAmount').optional().isFloat({ min: 0 }).withMessage('Disputed amount must be positive'),
];

exports.transitionValidators = [
    body('toStatus').notEmpty().withMessage('Target status required'),
    body('notes').optional().isLength({ max: 2000 }),
    body('resolutionAmount').optional().isFloat({ min: 0 }),
    body('resolutionNotes').optional().isLength({ max: 2000 }),
];

// ---- Sequence generator ----
async function nextDisputeNumber() {
    const [{ count }] = await knex('disputes').count('id as count');
    return `DSP-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;
}

// --- Open a dispute ---
exports.openDispute = asyncHandler(async (req, res) => {
    const { orderId, reason, description, disputedAmount } = req.body;

    // Verify the order exists and user is the buyer or vendor
    const order = await knex('orders').where({ id: orderId }).first();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });

    const isBuyer = order.buyer_id === req.user.id;
    const isVendor = order.vendor_id === req.user.id;
    if (!isBuyer && !isVendor && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Not authorized to raise a dispute on this order.' });
    }

    // Check if open dispute already exists for this order
    const existing = await knex('disputes')
        .where({ order_id: orderId })
        .whereNotIn('status', ['closed'])
        .first();
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'An active dispute already exists for this order.',
            data: { disputeNumber: existing.dispute_number },
        });
    }

    const disputeNumber = await nextDisputeNumber();
    const disputeId = uuidv4();
    const againstUserId = isBuyer ? order.vendor_id : order.buyer_id;

    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + config.governance.disputeSlaHours);

    await knex.transaction(async (trx) => {
        await trx('disputes').insert({
            id: disputeId,
            dispute_number: disputeNumber,
            order_id: orderId,
            raised_by: req.user.id,
            against_user: againstUserId,
            status: 'opened',
            reason,
            description,
            disputed_amount: disputedAmount || null,
            currency: order.currency || 'EUR',
            sla_deadline: slaDeadline,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        });

        await trx('dispute_state_log').insert({
            dispute_id: disputeId,
            from_status: null,
            to_status: 'opened',
            transitioned_by: req.user.id,
            notes: 'Dispute opened by user',
            created_at: trx.fn.now(),
        });

        // Lock order in disputed state
        await trx('orders').where({ id: orderId }).update({
            status: 'disputed',
            updated_at: trx.fn.now(),
        });
    });

    logger.audit('DISPUTE_OPENED', req.user.id, 'dispute', disputeId, {
        disputeNumber, orderId, reason, disputedAmount,
    });

    // Notify both parties via email (fire-and-forget)
    const raiserUser = await knex('users').where({ id: req.user.id }).select('email', 'first_name').first();
    const againstUser = await knex('users').where({ id: againstUserId }).select('email', 'first_name').first();

    sendDisputeOpenedEmail({ to: raiserUser.email, name: raiserUser.first_name, disputeNumber, orderId: order.order_number, reason }).catch(() => { });
    sendDisputeOpenedEmail({ to: againstUser.email, name: againstUser.first_name, disputeNumber, orderId: order.order_number, reason }).catch(() => { });

    res.status(201).json({
        success: true,
        message: 'Dispute opened. SLA: 72 hours for resolution.',
        data: { disputeId, disputeNumber, slaDeadline, status: 'opened' },
    });
});

// --- Get dispute details ---
exports.getDispute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const dispute = await knex('disputes').where({ id }).first();
    if (!dispute) return res.status(404).json({ success: false, error: 'Dispute not found.' });

    // Access control: buyer, vendor in dispute, or admin
    const order = await knex('orders').where({ id: dispute.order_id }).first();
    const isParty = req.user.id === dispute.raised_by
        || req.user.id === dispute.against_user
        || req.user.id === dispute.assigned_to;
    const isAdmin = ['super_admin', 'compliance_officer'].includes(req.user.role);

    if (!isParty && !isAdmin) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const evidence = await knex('dispute_evidence').where({ dispute_id: id }).orderBy('created_at', 'asc');
    const stateLog = await knex('dispute_state_log').where({ dispute_id: id }).orderBy('created_at', 'asc');

    res.json({ success: true, data: { ...dispute, order, evidence, stateLog } });
});

// --- List disputes ---
exports.listDisputes = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('disputes').select('*').orderBy('created_at', 'desc');

    const isAdmin = ['super_admin', 'compliance_officer'].includes(req.user.role);
    if (!isAdmin) {
        query = query.where((q) => q.where('raised_by', req.user.id).orWhere('against_user', req.user.id));
    }
    if (status) query = query.where({ status });

    const [{ count }] = await query.clone().count('id as count');
    const disputes = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: disputes,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
});

// --- Transition dispute status (admin / assigned resolver) ---
exports.transitionDispute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { toStatus, notes, resolutionAmount, resolutionNotes } = req.body;

    const dispute = await knex('disputes').where({ id }).first();
    if (!dispute) return res.status(404).json({ success: false, error: 'Dispute not found.' });

    const isAdmin = ['super_admin', 'compliance_officer'].includes(req.user.role);
    const isAssigned = dispute.assigned_to === req.user.id;
    const isRaiser = dispute.raised_by === req.user.id;

    // Raiser can only submit evidence; admin/assigned can do full transitions
    if (!isAdmin && !isAssigned) {
        const allowedForRaiser = ['evidence_collection'];
        if (!allowedForRaiser.includes(toStatus)) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for this transition.' });
        }
        if (!isRaiser) return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const result = await DisputeStateMachineService.transition(id, toStatus, req.user.id, notes, {
        resolutionAmount, resolutionNotes,
    });

    res.json({ success: true, message: `Dispute transitioned to '${toStatus}'.`, data: result });
});

// --- Assign dispute to resolver ---
exports.assignDispute = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignToUserId } = req.body;

    await knex('disputes').where({ id }).update({ assigned_to: assignToUserId, updated_at: knex.fn.now() });
    logger.audit('DISPUTE_ASSIGNED', req.user.id, 'dispute', id, { assignToUserId });
    res.json({ success: true, message: 'Dispute assigned.', data: { id, assignedTo: assignToUserId } });
});

// --- Submit evidence ---
exports.submitEvidence = asyncHandler(async (req, res) => {
    const { id: disputeId } = req.params;
    const { evidenceType, description } = req.body;
    const file = req.file;

    const dispute = await knex('disputes').where({ id: disputeId }).first();
    if (!dispute) return res.status(404).json({ success: false, error: 'Dispute not found.' });

    const isParty = req.user.id === dispute.raised_by || req.user.id === dispute.against_user;
    if (!isParty) return res.status(403).json({ success: false, error: 'Only disputing parties can submit evidence.' });

    await knex('dispute_evidence').insert({
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: req.user.id,
        evidence_type: evidenceType || 'document',
        file_name: file?.originalname || null,
        file_path: file?.path || null,
        mime_type: file?.mimetype || null,
        description: description || null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    logger.audit('DISPUTE_EVIDENCE_SUBMITTED', req.user.id, 'dispute', disputeId, { evidenceType });
    res.status(201).json({ success: true, message: 'Evidence submitted.' });
});
