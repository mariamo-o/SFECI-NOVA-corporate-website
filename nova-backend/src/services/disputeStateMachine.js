// ============================================================
// NOVA Platform — Dispute State Machine
// Enforces valid state transitions with SLA tracking.
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');

const VALID_TRANSITIONS = {
    opened: ['evidence_collection', 'under_review', 'closed', 'escalated'],
    evidence_collection: ['under_review', 'closed', 'escalated'],
    under_review: ['arbitration', 'resolved_buyer_favour', 'resolved_vendor_favour', 'resolved_split', 'escalated'],
    arbitration: ['resolved_buyer_favour', 'resolved_vendor_favour', 'resolved_split'],
    resolved_buyer_favour: ['closed'],
    resolved_vendor_favour: ['closed'],
    resolved_split: ['closed'],
    escalated: ['under_review', 'arbitration', 'closed'],
    closed: [],
};

const RESOLVED_STATUSES = ['resolved_buyer_favour', 'resolved_vendor_favour', 'resolved_split'];

class DisputeStateMachineService {
    /**
     * Transition a dispute to a new status.
     * @param {string} disputeId
     * @param {string} toStatus
     * @param {string} userId - who is triggering the transition
     * @param {string} notes
     * @param {object} resolutionData - { resolutionAmount, resolutionNotes } for resolved states
     */
    static async transition(disputeId, toStatus, userId, notes = '', resolutionData = {}) {
        const dispute = await knex('disputes').where({ id: disputeId }).first();
        if (!dispute) throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });

        const allowed = VALID_TRANSITIONS[dispute.status] || [];
        if (!allowed.includes(toStatus)) {
            throw Object.assign(
                new Error(`Cannot transition dispute from '${dispute.status}' to '${toStatus}'`),
                { statusCode: 422, currentStatus: dispute.status }
            );
        }

        const updates = {
            status: toStatus,
            updated_at: knex.fn.now(),
        };

        if (RESOLVED_STATUSES.includes(toStatus)) {
            updates.resolved_at = knex.fn.now();
            if (resolutionData.resolutionAmount !== undefined) {
                updates.resolution_amount = resolutionData.resolutionAmount;
            }
            if (resolutionData.resolutionNotes) {
                updates.resolution_notes = resolutionData.resolutionNotes;
            }
        }

        await knex.transaction(async (trx) => {
            await trx('disputes').where({ id: disputeId }).update(updates);
            await trx('dispute_state_log').insert({
                dispute_id: disputeId,
                from_status: dispute.status,
                to_status: toStatus,
                transitioned_by: userId,
                notes,
                created_at: trx.fn.now(),
            });
        });

        logger.audit('DISPUTE_TRANSITION', userId, 'dispute', disputeId, {
            from: dispute.status,
            to: toStatus,
            notes,
        });

        return { disputeId, from: dispute.status, to: toStatus };
    }

    /**
     * Check for overdue disputes and escalate them.
     * Called by cron every hour.
     */
    static async processOverdueDisputes() {
        const overdue = await knex('disputes')
            .whereNotIn('status', [...RESOLVED_STATUSES, 'closed'])
            .where('sla_deadline', '<', knex.fn.now())
            .select('id', 'status', 'dispute_number');

        let escalated = 0;
        for (const d of overdue) {
            try {
                await DisputeStateMachineService.transition(
                    d.id,
                    'escalated',
                    null,
                    'Auto-escalated: SLA deadline breached'
                );
                escalated++;
            } catch (err) {
                logger.error('Failed to auto-escalate dispute', { disputeId: d.id, error: err.message });
            }
        }

        return { escalated, total: overdue.length };
    }
}

module.exports = { DisputeStateMachineService, VALID_TRANSITIONS, RESOLVED_STATUSES };
