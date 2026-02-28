// ============================================================
// NOVA Platform — Invoice Controller
// ============================================================
'use strict';

const { knex } = require('../config/database');
const invoiceService = require('../services/invoice.service');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { body } = require('express-validator');

exports.createValidators = [
    body('orderId').isUUID().withMessage('Valid order ID required'),
    body('taxRate').optional().isFloat({ min: 0, max: 1 }).withMessage('Tax rate must be 0.0–1.0'),
    body('dueInDays').optional().isInt({ min: 1, max: 365 }),
    body('notes').optional().trim().isLength({ max: 2000 }),
];

exports.creditNoteValidators = [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
    body('reason').trim().isLength({ min: 5 }).withMessage('Reason required'),
];

/** POST /invoices — Generate invoice from order */
exports.createInvoice = asyncHandler(async (req, res) => {
    const { orderId, taxRate, dueInDays, notes } = req.body;

    // Access check: only admin, compliance, or buyer of the order
    const order = await knex('orders').where({ id: orderId }).first();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });

    const isAdmin = ['admin', 'super_admin', 'compliance_officer'].includes(req.user.role);
    if (!isAdmin && order.buyer_id !== req.user.id && order.vendor_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const invoice = await invoiceService.generateFromOrder(orderId, { taxRate, dueInDays, notes });
    logger.audit('INVOICE_CREATED', req.user.id, 'invoice', invoice.id, { orderId });
    res.status(201).json({ success: true, message: 'Invoice generated.', data: invoice });
});

/** GET /invoices — List invoices (role-filtered) */
exports.listInvoices = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('invoices').select('*').orderBy('created_at', 'desc');

    const isAdmin = ['admin', 'super_admin', 'compliance_officer'].includes(req.user.role);
    if (!isAdmin) {
        if (req.user.role === 'vendor') {
            const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
            if (vendor) query = query.where('vendor_id', vendor.id);
            else return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 } });
        } else {
            query = query.where('buyer_id', req.user.id);
        }
    }
    if (status) query = query.where({ status });

    const [{ count }] = await query.clone().count('id as count');
    const invoices = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: invoices,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) },
    });
});

/** GET /invoices/:id — Full invoice detail */
exports.getInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const invoice = await invoiceService.getInvoiceSummary(id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    const isAdmin = ['admin', 'super_admin', 'compliance_officer'].includes(req.user.role);
    const isParty = invoice.buyer_id === req.user.id || invoice.vendor_id === req.user.id;
    if (!isAdmin && !isParty) return res.status(403).json({ success: false, error: 'Access denied.' });

    res.json({ success: true, data: invoice });
});

/** PATCH /invoices/:id/status — Update invoice status */
exports.updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['paid', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }

    const [updated] = await knex('invoices').where({ id })
        .update({
            status,
            paid_at: status === 'paid' ? knex.fn.now() : null,
            updated_at: knex.fn.now(),
        }).returning('*');

    if (!updated) return res.status(404).json({ success: false, error: 'Invoice not found.' });
    logger.audit('INVOICE_STATUS_UPDATED', req.user.id, 'invoice', id, { status });
    res.json({ success: true, message: `Invoice marked as ${status}.`, data: updated });
});

/** POST /invoices/:id/credit-note — Issue credit note */
exports.issueCreditNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const cn = await invoiceService.issueCreditNote(id, amount, reason, req.user.id);
    res.status(201).json({ success: true, message: 'Credit note issued.', data: cn });
});
