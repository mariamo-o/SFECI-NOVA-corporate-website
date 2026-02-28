// ============================================================
// NOVA Platform — RFQ State Machine (Server-Enforced)
// No client can bypass state transition rules.
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');

// Allowed transitions: { from: [to, to, ...] }
const TRANSITIONS = {
    draft: ['submitted', 'rejected'],
    submitted: ['notified', 'rejected'],
    notified: ['quoted', 'expired', 'rejected'],
    quoted: ['comparing', 'expired', 'rejected'],
    comparing: ['selected', 'rejected'],
    selected: ['order_created', 'comparing'],   // Can revert to re-compare
    order_created: ['closed'],
    rejected: [],                               // Terminal
    expired: [],                               // Terminal
    closed: [],                               // Terminal
};

// Actions that require specific roles
const ROLE_REQUIREMENTS = {
    submit: ['buyer', 'admin', 'super_admin'],
    notify: ['admin', 'super_admin'],          // System or admin notifies vendors
    quote: ['vendor'],                        // Only vendors can submit quotes
    compare: ['buyer', 'admin'],
    select: ['buyer'],
    create_order: ['admin', 'super_admin'],
    close: ['admin', 'super_admin'],
    reject: ['buyer', 'admin', 'super_admin'],
    expire: ['system'],                        // Cron job only
};

class RFQStateMachine {
    /**
     * Validate and execute a state transition.
     * Logs to rfq_state_log — immutable record.
     */
    static async transition(rfqId, toStatus, userId, notes = '', isAiAction = false) {
        return knex.transaction(async (trx) => {
            // Lock the row for update to prevent race conditions
            const rfq = await trx('rfqs').where({ id: rfqId }).forUpdate().first();

            if (!rfq) {
                const err = new Error('RFQ not found');
                err.statusCode = 404;
                throw err;
            }

            const allowedNext = TRANSITIONS[rfq.status];
            if (!allowedNext) {
                const err = new Error(`Unknown current status: ${rfq.status}`);
                err.statusCode = 500;
                throw err;
            }

            if (!allowedNext.includes(toStatus)) {
                const err = new Error(
                    `Invalid transition: ${rfq.status} → ${toStatus}. Allowed: [${allowedNext.join(', ')}]`
                );
                err.statusCode = 422;
                throw err;
            }

            const prevStatus = rfq.status;

            // Calculate SLA deadline on submission
            const updates = { status: toStatus, updated_at: knex.fn.now() };
            if (toStatus === 'submitted') {
                const config = require('../config/env');
                const slaDeadline = new Date();
                slaDeadline.setHours(slaDeadline.getHours() + config.governance.rfqSlaHours);
                updates.sla_deadline = slaDeadline;
            }

            // Update RFQ status
            await trx('rfqs').where({ id: rfqId }).update(updates);

            // Log transition (immutable)
            await trx('rfq_state_log').insert({
                rfq_id: rfqId,
                from_status: prevStatus,
                to_status: toStatus,
                transitioned_by: isAiAction ? null : userId,
                is_ai_action: isAiAction,
                notes,
                metadata: JSON.stringify({ userId }),
                created_at: trx.fn.now(),
            });

            logger.audit('RFQ_STATE_TRANSITION', userId, 'rfq', rfqId, {
                from: prevStatus,
                to: toStatus,
                isAiAction,
            });

            return { rfqId, from: prevStatus, to: toStatus };
        });
    }

    /**
     * Check for SLA breaches and mark expired RFQs.
     * Called by cron job every hour.
     */
    static async processExpiredRFQs() {
        const now = new Date();

        // Mark SLA breaches
        const breached = await knex('rfqs')
            .whereIn('status', ['submitted', 'notified', 'quoted'])
            .where('sla_deadline', '<', now)
            .where('sla_breached', false)
            .update({ sla_breached: true, updated_at: knex.fn.now() })
            .returning('id');

        if (breached.length > 0) {
            logger.warn('RFQ SLA breaches detected', { count: breached.length, rfqIds: breached });
        }

        // Expire RFQs past quote deadline with no quotes
        const submitted = await knex('rfqs')
            .where('status', 'notified')
            .where('quote_deadline', '<', now)
            .select('id');

        for (const rfq of submitted) {
            try {
                await RFQStateMachine.transition(rfq.id, 'expired', null, 'Auto-expired: quote deadline passed', true);
            } catch (e) {
                logger.error('Failed to expire RFQ', { rfqId: rfq.id, error: e.message });
            }
        }

        return { breached: breached.length, expired: submitted.length };
    }

    /**
     * Get available transitions for a given RFQ status.
     */
    static getAvailableTransitions(status) {
        return TRANSITIONS[status] || [];
    }
}

module.exports = { RFQStateMachine, TRANSITIONS, ROLE_REQUIREMENTS };
