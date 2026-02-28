// ============================================================
// NOVA Platform — AI Governance Service
// Logs AI decisions, enforces confidence thresholds,
// manages human override SLA, bias monitoring.
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const logger = require('../config/logger');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.75');
const ESCALATION_SLA_HOURS = parseInt(process.env.AI_ESCALATION_SLA_HOURS || '24', 10);

// ============================================================
// DECISION LOGGING
// ============================================================

/**
 * Log an AI decision to the governance table.
 * Returns the inserted decision record.
 * @param {string} type - Decision type (e.g. 'rfq_categorization', 'vendor_risk_score')
 * @param {string} entityType - Entity being decided on (e.g. 'rfq', 'vendor')
 * @param {string} entityId - UUID of entity
 * @param {string} modelVersion - Model/algorithm version string
 * @param {number} confidence - Confidence score 0.0–1.0
 * @param {Object} input - Input data passed to model
 * @param {Object} output - Output produced by model
 * @returns {Object} Created ai_decision record
 */
async function logDecision(type, entityType, entityId, modelVersion, confidence, input, output) {
    const [decision] = await knex('ai_decisions').insert({
        id: uuidv4(),
        decision_type: type,
        entity_type: entityType,
        entity_id: entityId || null,
        model_version: modelVersion,
        confidence_score: confidence,
        input_payload: JSON.stringify(input || {}),
        output_payload: JSON.stringify(output || {}),
        human_override: false,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.info('[AI] Decision logged', {
        decisionId: decision.id,
        type,
        entityType,
        entityId,
        confidence,
        modelVersion,
    });

    // Automatically check confidence threshold after logging
    await checkConfidenceThreshold(decision.id, confidence);

    return decision;
}

// ============================================================
// CONFIDENCE THRESHOLD & ESCALATION
// ============================================================

/**
 * Check if an AI decision confidence is below the threshold.
 * If so, create an escalation requiring human review.
 * @param {string} decisionId - UUID of ai_decision
 * @param {number} confidence - Confidence score 0.0–1.0
 * @returns {Object|null} Created escalation or null if not needed
 */
async function checkConfidenceThreshold(decisionId, confidence) {
    if (confidence >= CONFIDENCE_THRESHOLD) return null;

    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + ESCALATION_SLA_HOURS);

    const [escalation] = await knex('ai_escalations').insert({
        id: uuidv4(),
        ai_decision_id: decisionId,
        reason: `Confidence score ${(confidence * 100).toFixed(1)}% is below threshold (${(CONFIDENCE_THRESHOLD * 100).toFixed(1)}%). Human review required.`,
        confidence_at_escalation: confidence,
        escalated_at: knex.fn.now(),
        sla_deadline: slaDeadline,
        sla_breach: false,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.warn('[AI Governance] Confidence below threshold — escalation created', {
        decisionId,
        confidence,
        threshold: CONFIDENCE_THRESHOLD,
        escalationId: escalation.id,
        slaDeadline,
    });

    return escalation;
}

/**
 * Process overdue escalations (called by CRON every 30 min).
 * Flags SLA breach on unresolved escalations past deadline.
 * @returns {{ flagged: number }}
 */
async function processEscalations() {
    const now = new Date();
    const updated = await knex('ai_escalations')
        .whereNull('resolved_at')
        .where('sla_deadline', '<', now)
        .where('sla_breach', false)
        .update({ sla_breach: true, updated_at: knex.fn.now() })
        .returning('id');

    if (updated.length > 0) {
        logger.warn('[AI Governance] SLA breaches flagged on escalations', { count: updated.length });
    }

    return { flagged: updated.length };
}

// ============================================================
// HUMAN OVERRIDE
// ============================================================

/**
 * Record a human override of an AI decision.
 * @param {string} decisionId - UUID of ai_decision to override
 * @param {string} userId - UUID of admin/compliance officer
 * @param {Object} newOutcome - The corrected output payload
 * @param {string} reason - Explanation for the override
 * @returns {Object} Updated ai_decision
 */
async function overrideDecision(decisionId, userId, newOutcome, reason) {
    const decision = await knex('ai_decisions').where({ id: decisionId }).first();
    if (!decision) {
        const err = new Error('AI decision not found');
        err.statusCode = 404;
        throw err;
    }

    const [updated] = await knex('ai_decisions').where({ id: decisionId }).update({
        human_override: true,
        override_by: userId,
        override_at: knex.fn.now(),
        override_reason: reason,
        override_output: JSON.stringify(newOutcome || {}),
        updated_at: knex.fn.now(),
    }).returning('*');

    // Resolve any open escalation for this decision
    await knex('ai_escalations')
        .where({ ai_decision_id: decisionId })
        .whereNull('resolved_at')
        .update({
            resolved_at: knex.fn.now(),
            resolved_by: userId,
            resolution_notes: `Human override applied: ${reason}`,
            updated_at: knex.fn.now(),
        });

    logger.audit('AI_DECISION_OVERRIDDEN', userId, 'ai_decision', decisionId, { reason });
    return updated;
}

// ============================================================
// EXPLAINABILITY
// ============================================================

/**
 * Generate an explainability report for an AI decision.
 * @param {string} decisionId - UUID of ai_decision
 * @returns {Object} Full detail including inputs, output, override history, escalations
 */
async function getExplainabilityReport(decisionId) {
    const decision = await knex('ai_decisions').where({ id: decisionId }).first();
    if (!decision) {
        const err = new Error('AI decision not found');
        err.statusCode = 404;
        throw err;
    }

    const escalations = await knex('ai_escalations').where({ ai_decision_id: decisionId }).orderBy('escalated_at');

    const inputPayload = typeof decision.input_payload === 'string' ? JSON.parse(decision.input_payload) : decision.input_payload;
    const outputPayload = typeof decision.output_payload === 'string' ? JSON.parse(decision.output_payload) : decision.output_payload;
    const overrideOutput = decision.override_output
        ? (typeof decision.override_output === 'string' ? JSON.parse(decision.override_output) : decision.override_output)
        : null;

    return {
        decision_id: decision.id,
        type: decision.decision_type,
        entity: { type: decision.entity_type, id: decision.entity_id },
        model: { version: decision.model_version },
        confidence: {
            score: parseFloat(decision.confidence_score || 0),
            percentage: `${(parseFloat(decision.confidence_score || 0) * 100).toFixed(1)}%`,
            above_threshold: parseFloat(decision.confidence_score || 0) >= CONFIDENCE_THRESHOLD,
            threshold: CONFIDENCE_THRESHOLD,
        },
        original_input: inputPayload,
        original_output: outputPayload,
        human_override: {
            applied: decision.human_override,
            by: decision.override_by,
            at: decision.override_at,
            reason: decision.override_reason,
            corrected_output: overrideOutput,
        },
        escalations,
        created_at: decision.created_at,
    };
}

// ============================================================
// BIAS MONITORING
// ============================================================

/**
 * Get bias distribution report across country and sector.
 * Identifies if AI systematically produces different outcomes by demographic.
 * @param {{ from: Date, to: Date }} dateRange
 * @returns {Object} Distribution breakdown
 */
async function getBiasReport(dateRange = {}) {
    const from = dateRange.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateRange.to || new Date();

    // Confidence distribution by decision type
    const byType = await knex('ai_decisions')
        .whereBetween('created_at', [from, to])
        .select('decision_type')
        .avg('confidence_score as avg_confidence')
        .count('id as total')
        .sum(knex.raw('CASE WHEN human_override THEN 1 ELSE 0 END as overrides'))
        .groupBy('decision_type')
        .orderBy('avg_confidence', 'asc');

    // Override rate
    const [{ total_decisions }] = await knex('ai_decisions').whereBetween('created_at', [from, to]).count('id as total_decisions');
    const [{ total_overrides }] = await knex('ai_decisions').whereBetween('created_at', [from, to]).where({ human_override: true }).count('id as total_overrides');
    const [{ total_escalations }] = await knex('ai_escalations').whereBetween('created_at', [from, to]).count('id as total_escalations');
    const [{ sla_breaches }] = await knex('ai_escalations').whereBetween('created_at', [from, to]).where({ sla_breach: true }).count('id as sla_breaches');

    return {
        period: { from, to },
        summary: {
            total_decisions: parseInt(total_decisions),
            total_overrides: parseInt(total_overrides),
            override_rate: parseInt(total_decisions) > 0
                ? `${Math.round((parseInt(total_overrides) / parseInt(total_decisions)) * 100)}%`
                : '0%',
            total_escalations: parseInt(total_escalations),
            sla_breaches: parseInt(sla_breaches),
        },
        by_decision_type: byType,
        bias_flags: byType.filter((d) => parseFloat(d.avg_confidence) < 0.60).map((d) => ({
            decision_type: d.decision_type,
            avg_confidence: parseFloat(d.avg_confidence),
            flag: 'Low average confidence — potential systematic bias',
        })),
    };
}

module.exports = {
    logDecision,
    checkConfidenceThreshold,
    processEscalations,
    overrideDecision,
    getExplainabilityReport,
    getBiasReport,
    CONFIDENCE_THRESHOLD,
};
