// ============================================================
// NOVA Platform — RFQ Controller
// Full RFQ lifecycle: create → submit → quote → select → order
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const { RFQStateMachine } = require('../services/rfqStateMachine');
const { categorizeRFQWithAI } = require('../services/aiCategorizer');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { body } = require('express-validator');
const config = require('../config/env');

exports.createValidators = [
    body('title').trim().isLength({ min: 5, max: 500 }).withMessage('Title required (5-500 chars)'),
    body('description').trim().isLength({ min: 20 }).withMessage('Description required (min 20 chars)'),
    body('sector').optional().isIn(['industrial', 'energy', 'medical', 'trading', 'tech', 'mega_projects', 'general']),
    body('items').isArray({ min: 1 }).withMessage('At least one line item required'),
    body('items.*.name').trim().notEmpty().withMessage('Item name required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Item quantity must be a positive integer'),
];

// Sequence generator for RFQ numbers
async function nextRFQNumber() {
    const [{ count }] = await knex('rfqs').count('id as count');
    return `RFQ-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;
}

// --- Create RFQ ---
exports.createRFQ = asyncHandler(async (req, res) => {
    const { title, description, sector, budget_min, budget_max, budget_currency,
        delivery_country, required_delivery_date, items } = req.body;

    // AI categorization
    const aiResult = await categorizeRFQWithAI(title, description);
    const finalSector = sector || aiResult.sector;

    const rfqNumber = await nextRFQNumber();
    const rfqId = uuidv4();

    // SLA deadline: must receive quotes within N hours of submission
    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + config.governance.rfqSlaHours);

    const quoteDeadline = new Date();
    quoteDeadline.setDate(quoteDeadline.getDate() + 7); // 7-day default quote window

    await knex.transaction(async (trx) => {
        await trx('rfqs').insert({
            id: rfqId,
            rfq_number: rfqNumber,
            buyer_id: req.user.id,
            title,
            description,
            sector: finalSector,
            budget_min, budget_max,
            budget_currency: budget_currency || 'EUR',
            delivery_country,
            required_delivery_date,
            status: 'draft',
            sla_deadline: slaDeadline,
            quote_deadline: quoteDeadline,
            ai_category: aiResult.sector,
            ai_category_confidence: aiResult.confidence,
            metadata: JSON.stringify({ aiModel: aiResult.model }),
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        });

        if (items && items.length > 0) {
            await trx('rfq_items').insert(
                items.map((item) => ({
                    id: uuidv4(),
                    rfq_id: rfqId,
                    name: item.name,
                    specifications: item.specifications,
                    quantity: item.quantity,
                    unit_of_measure: item.unit_of_measure,
                    target_unit_price: item.target_unit_price,
                    hs_code: item.hs_code,
                    created_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                }))
            );
        }
    });

    logger.audit('RFQ_CREATED', req.user.id, 'rfq', rfqId, { rfqNumber, sector: finalSector });

    const rfq = await knex('rfqs').where({ id: rfqId }).first();
    const rfqItems = await knex('rfq_items').where({ rfq_id: rfqId });

    res.status(201).json({
        success: true,
        message: 'RFQ created successfully.',
        data: { ...rfq, items: rfqItems, aiCategorization: aiResult },
    });
});

// --- Submit RFQ (transition: draft → submitted) ---
exports.submitRFQ = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rfq = await knex('rfqs').where({ id, buyer_id: req.user.id }).first();
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found.' });

    const result = await RFQStateMachine.transition(id, 'submitted', req.user.id, 'Buyer submitted RFQ');
    res.json({ success: true, message: 'RFQ submitted for vendor notification.', data: result });
});

// --- Get RFQ by ID ---
exports.getRFQ = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rfq = await knex('rfqs').where({ id }).first();
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found.' });

    // Buyers only see their own; admins/venders see based on role
    if (req.user.role === 'buyer' && rfq.buyer_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const items = await knex('rfq_items').where({ rfq_id: id });
    const quotes = await knex('rfq_quotes').where({ rfq_id: id });
    const stateLog = await knex('rfq_state_log').where({ rfq_id: id }).orderBy('created_at', 'asc');

    res.json({ success: true, data: { ...rfq, items, quotes, stateLog } });
});

// --- List RFQs (filtered by role) ---
exports.listRFQs = asyncHandler(async (req, res) => {
    const { status, sector, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('rfqs').select('*').orderBy('created_at', 'desc');

    if (req.user.role === 'buyer') query = query.where({ buyer_id: req.user.id });
    // Vendors see submitted/notified/quoted RFQs in their sectors
    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id, status: 'approved' }).first();
        if (!vendor) return res.json({ success: true, data: [], pagination: {} });
        query = query.whereIn('status', ['notified', 'quoted', 'comparing', 'selected']);
        const sectors = vendor.sectors || [];
        if (sectors.length > 0) {
            query = query.whereIn('sector', sectors);
        }
    }
    if (status) query = query.where({ status });
    if (sector) query = query.where({ sector });

    const [{ count }] = await query.clone().count('id as count');
    const rfqs = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: rfqs,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
});

// --- Submit a quote (vendor) ---
exports.submitQuote = asyncHandler(async (req, res) => {
    const { id: rfqId } = req.params;
    const { total_amount, currency, delivery_days, valid_until, notes, line_items } = req.body;

    const rfq = await knex('rfqs').where({ id: rfqId }).whereIn('status', ['notified', 'quoted']).first();
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not available for quoting.' });

    const vendor = await knex('vendors').where({ user_id: req.user.id, status: 'approved' }).first();
    if (!vendor) return res.status(403).json({ success: false, error: 'Only approved vendors can submit quotes.' });

    const existing = await knex('rfq_quotes').where({ rfq_id: rfqId, vendor_id: vendor.id }).first();
    if (existing) return res.status(409).json({ success: false, error: 'You have already submitted a quote for this RFQ.' });

    const [{ count }] = await knex('rfq_quotes').count('id as count');
    const quoteNumber = `QTE-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;

    await knex.transaction(async (trx) => {
        await trx('rfq_quotes').insert({
            id: uuidv4(),
            rfq_id: rfqId,
            vendor_id: vendor.id,
            quote_number: quoteNumber,
            status: 'submitted',
            total_amount,
            currency: currency || 'EUR',
            delivery_days,
            valid_until,
            notes,
            line_items: JSON.stringify(line_items || []),
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        });

        // Advance RFQ if still notified
        if (rfq.status === 'notified') {
            await RFQStateMachine.transition(rfqId, 'quoted', vendor.user_id, 'First quote received', false);
        }
    });

    logger.audit('RFQ_QUOTE_SUBMITTED', req.user.id, 'rfq_quote', quoteNumber, { rfqId, vendorId: vendor.id, total_amount });
    res.status(201).json({ success: true, message: 'Quote submitted successfully.', data: { quoteNumber } });
});

// --- Select a quote (buyer) ---
exports.selectQuote = asyncHandler(async (req, res) => {
    const { id: rfqId, quoteId } = req.params;

    const rfq = await knex('rfqs').where({ id: rfqId, buyer_id: req.user.id }).first();
    if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found.' });

    const quote = await knex('rfq_quotes').where({ id: quoteId, rfq_id: rfqId, status: 'submitted' }).first();
    if (!quote) return res.status(404).json({ success: false, error: 'Quote not found or already actioned.' });

    await knex.transaction(async (trx) => {
        // Mark selected quote as accepted
        await trx('rfq_quotes').where({ id: quoteId }).update({ status: 'accepted', updated_at: trx.fn.now() });
        // Reject other quotes
        await trx('rfq_quotes').where({ rfq_id: rfqId }).whereNot({ id: quoteId }).update({ status: 'rejected', updated_at: trx.fn.now() });
        // Update RFQ
        await trx('rfqs').where({ id: rfqId }).update({ selected_quote_id: quoteId, updated_at: trx.fn.now() });
        // State transition
        await RFQStateMachine.transition(rfqId, 'selected', req.user.id, `Quote ${quoteId} selected`);
    });

    logger.audit('RFQ_QUOTE_SELECTED', req.user.id, 'rfq', rfqId, { quoteId });
    res.json({ success: true, message: 'Quote selected. Proceed to create order.', data: { rfqId, selectedQuoteId: quoteId } });
});

// --- Get RFQ state history ---
exports.getRFQStateLog = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const log = await knex('rfq_state_log').where({ rfq_id: id }).orderBy('created_at', 'asc');
    res.json({ success: true, data: log });
});
