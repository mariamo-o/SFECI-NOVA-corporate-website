// ============================================================
// NOVA Platform — AI Governance Controller
// ============================================================
'use strict';

const aiGovernanceService = require('../services/aiGovernance.service');
const { asyncHandler } = require('../middleware/errorHandler');
const { knex } = require('../config/database');
const { body } = require('express-validator');

exports.overrideValidators = [
    body('newOutcome').notEmpty().withMessage('newOutcome payload required'),
    body('reason').trim().isLength({ min: 10 }).withMessage('Override reason required (min 10 chars)'),
];

/** GET /ai/decisions — List AI decisions with filters */
exports.listDecisions = asyncHandler(async (req, res) => {
    const { decision_type, entity_type, human_override, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('ai_decisions').select('*').orderBy('created_at', 'desc');
    if (decision_type) query = query.where({ decision_type });
    if (entity_type) query = query.where({ entity_type });
    if (human_override !== undefined) query = query.where({ human_override: human_override === 'true' });

    const [{ count }] = await query.clone().count('id as count');
    const decisions = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: decisions,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
});

/** GET /ai/decisions/:id — Explainability report */
exports.getExplainability = asyncHandler(async (req, res) => {
    const report = await aiGovernanceService.getExplainabilityReport(req.params.id);
    res.json({ success: true, data: report });
});

/** POST /ai/decisions/:id/override — Human override */
exports.overrideDecision = asyncHandler(async (req, res) => {
    const { newOutcome, reason } = req.body;
    const result = await aiGovernanceService.overrideDecision(req.params.id, req.user.id, newOutcome, reason);
    res.json({ success: true, message: 'AI decision overridden.', data: result });
});

/** GET /ai/escalations — List open escalations */
exports.listEscalations = asyncHandler(async (req, res) => {
    const { resolved, sla_breach, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('ai_escalations').select('*').orderBy('escalated_at', 'desc');
    if (resolved === 'false') query = query.whereNull('resolved_at');
    if (resolved === 'true') query = query.whereNotNull('resolved_at');
    if (sla_breach !== undefined) query = query.where({ sla_breach: sla_breach === 'true' });

    const [{ count }] = await query.clone().count('id as count');
    const escalations = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: escalations,
        pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
});

/** GET /ai/stats — Confidence distribution + bias report */
exports.getStats = asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const biasReport = await aiGovernanceService.getBiasReport({ from, to });

    const [{ avg_confidence }] = await knex('ai_decisions').whereBetween('created_at', [from, to]).avg('confidence_score as avg_confidence');
    const [{ total }] = await knex('ai_decisions').whereBetween('created_at', [from, to]).count('id as total');
    const [{ overrides }] = await knex('ai_decisions').whereBetween('created_at', [from, to]).where({ human_override: true }).count('id as overrides');

    res.json({
        success: true,
        data: {
            confidence_threshold: aiGovernanceService.CONFIDENCE_THRESHOLD,
            avg_confidence: parseFloat(avg_confidence || 0).toFixed(3),
            total_decisions: parseInt(total),
            total_overrides: parseInt(overrides),
            ...biasReport,
        },
    });
});
