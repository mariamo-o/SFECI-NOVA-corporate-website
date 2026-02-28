// ============================================================
// NOVA Platform — Vendor Controller
// Full onboarding workflow CRUD
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { knex } = require('../config/database');
const { calculateVendorRisk, advanceToBoard } = require('../services/vendorRisk');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const config = require('../config/env');
const { body } = require('express-validator');

exports.createValidators = [
    body('company_name').trim().isLength({ min: 2, max: 255 }).withMessage('Company name required'),
    body('country').isISO31661Alpha2().withMessage('Valid ISO country code required'),
    body('registration_number').optional().trim().isLength({ max: 100 }),
    body('vat_number').optional().trim().isLength({ max: 100 }),
    body('sectors').isArray({ min: 1 }).withMessage('At least one sector required'),
];

// --- Create vendor profile ---
exports.createVendor = asyncHandler(async (req, res) => {
    const { company_name, trade_name, registration_number, vat_number, country,
        address, city, postal_code, website, description, sectors } = req.body;

    const existing = await knex('vendors').where({ user_id: req.user.id }).first();
    if (existing) {
        return res.status(409).json({ success: false, error: 'Vendor profile already exists for this account.' });
    }

    const [vendor] = await knex('vendors').insert({
        id: uuidv4(),
        user_id: req.user.id,
        company_name, trade_name, registration_number, vat_number, country,
        address, city, postal_code, website, description,
        sectors: JSON.stringify(sectors || []),
        status: 'registered',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.audit('VENDOR_CREATED', req.user.id, 'vendor', vendor.id, { company_name });
    res.status(201).json({ success: true, message: 'Vendor profile created.', data: vendor });
});

// --- Get vendor profile (own) ---
exports.getMyVendor = asyncHandler(async (req, res) => {
    const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'No vendor profile found.' });
    res.json({ success: true, data: vendor });
});

// --- Get vendor with documents (admin) ---
exports.getVendorById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const vendor = await knex('vendors').where({ id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found.' });

    const documents = await knex('vendor_documents').where({ vendor_id: id });
    const riskScores = await knex('vendor_risk_scores')
        .where({ vendor_id: id }).orderBy('created_at', 'desc').limit(5);

    res.json({ success: true, data: { ...vendor, documents, riskScores } });
});

// --- List all vendors (admin / compliance) ---
exports.listVendors = asyncHandler(async (req, res) => {
    const { status, country, risk_level, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('vendors').select('*').orderBy('created_at', 'desc');
    if (status) query = query.where({ status });
    if (country) query = query.where({ country });
    if (risk_level) query = query.where({ risk_level });

    const [{ count }] = await query.clone().count('id as count');
    const vendors = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: vendors,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
});

// --- Submit documents (vendor uploads) ---
exports.submitDocuments = asyncHandler(async (req, res) => {
    const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found.' });

    const files = req.files;
    if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded.' });
    }

    const documentType = req.body.document_type;
    if (!documentType) return res.status(400).json({ success: false, error: 'document_type required.' });

    const inserted = [];
    for (const file of files) {
        const ext = path.extname(file.originalname).slice(1).toLowerCase();
        if (!config.upload.allowedTypes.includes(ext)) {
            return res.status(400).json({ success: false, error: `File type .${ext} not allowed.` });
        }
        if (file.size > config.upload.maxSizeMb * 1024 * 1024) {
            return res.status(413).json({ success: false, error: 'File exceeds size limit.' });
        }

        const [doc] = await knex('vendor_documents').insert({
            id: uuidv4(),
            vendor_id: vendor.id,
            document_type: documentType,
            filename: file.originalname,
            storage_path: file.path,
            mime_type: file.mimetype,
            size_bytes: file.size,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        }).returning('*');

        inserted.push(doc);
    }

    // Advance status to docs_submitted if still in registered
    if (vendor.status === 'registered') {
        await knex('vendors').where({ id: vendor.id }).update({ status: 'docs_submitted', updated_at: knex.fn.now() });
    }

    logger.audit('VENDOR_DOCS_UPLOADED', req.user.id, 'vendor', vendor.id, { count: inserted.length, documentType });
    res.status(201).json({ success: true, message: `${inserted.length} document(s) uploaded.`, data: inserted });
});

// --- Trigger KYC and risk scoring (compliance officer) ---
exports.triggerRiskScore = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const vendor = await knex('vendors').where({ id }).whereIn('status', ['docs_submitted', 'kyc_review']).first();
    if (!vendor) return res.status(422).json({ success: false, error: 'Vendor must be in docs_submitted or kyc_review state.' });

    await knex('vendors').where({ id }).update({ status: 'kyc_review', updated_at: knex.fn.now() });
    const result = await calculateVendorRisk(id);

    logger.audit('VENDOR_RISK_TRIGGERED', req.user.id, 'vendor', id, result);
    res.json({ success: true, message: 'Risk assessment complete.', data: result });
});

// --- Advance to board (compliance officer) ---
exports.advanceToBoard = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await advanceToBoard(id, req.user.id, req.body.notes);
    res.json({ success: true, message: 'Vendor submitted for board review.', data: result });
});

// --- Board approve / reject (admin) ---
exports.boardDecision = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision, reason } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, error: 'Decision must be approved or rejected.' });
    }

    const vendor = await knex('vendors').where({ id, status: 'board_review' }).first();
    if (!vendor) return res.status(422).json({ success: false, error: 'Vendor not in board_review state.' });

    await knex.transaction(async (trx) => {
        await trx('vendors').where({ id }).update({
            status: decision,
            approved_by: req.user.id,
            approved_at: decision === 'approved' ? trx.fn.now() : null,
            rejection_reason: decision === 'rejected' ? reason : null,
            updated_at: trx.fn.now(),
        });

        await trx('board_approvals')
            .where({ resource_type: 'vendor', resource_id: id, status: 'pending' })
            .update({ status: decision, reviewed_by: req.user.id, reviewed_at: trx.fn.now(), review_notes: reason });
    });

    logger.audit(`VENDOR_${decision.toUpperCase()}`, req.user.id, 'vendor', id, { reason });
    res.json({ success: true, message: `Vendor ${decision}.`, data: { id, status: decision } });
});
