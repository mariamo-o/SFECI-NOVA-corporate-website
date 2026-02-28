// Migration: 009 — AI Governance Framework
// Tables: ai_decisions, ai_escalations
'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('ai_decisions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('decision_type', 100).notNullable();        // e.g. 'rfq_categorization', 'vendor_risk'
        t.string('entity_type', 100).notNullable();
        t.uuid('entity_id');
        t.string('model_version', 100).notNullable();        // e.g. 'rule-based-v1', 'ml-v2.1'
        t.decimal('confidence_score', 5, 4);                 // 0.0 – 1.0
        t.jsonb('input_payload').defaultTo('{}');
        t.jsonb('output_payload').defaultTo('{}');
        t.boolean('human_override').defaultTo(false);
        t.uuid('override_by').references('id').inTable('users');
        t.timestamp('override_at');
        t.text('override_reason');
        t.jsonb('override_output').defaultTo('{}');
        t.boolean('bias_flagged').defaultTo(false);
        t.text('bias_notes');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('ai_escalations', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('ai_decision_id').notNullable().references('id').inTable('ai_decisions').onDelete('CASCADE');
        t.text('reason').notNullable();
        t.decimal('confidence_at_escalation', 5, 4);
        t.timestamp('escalated_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('sla_deadline');                          // Must be resolved within X hours
        t.timestamp('resolved_at');
        t.uuid('resolved_by').references('id').inTable('users');
        t.text('resolution_notes');
        t.boolean('sla_breach').defaultTo(false);
        t.timestamps(true, true);
    });

    await knex.raw('CREATE INDEX idx_ai_decisions_type ON ai_decisions (decision_type)');
    await knex.raw('CREATE INDEX idx_ai_decisions_entity ON ai_decisions (entity_type, entity_id)');
    await knex.raw('CREATE INDEX idx_ai_decisions_confidence ON ai_decisions (confidence_score)');
    await knex.raw('CREATE INDEX idx_ai_escalations_decision ON ai_escalations (ai_decision_id)');
    await knex.raw('CREATE INDEX idx_ai_escalations_resolved ON ai_escalations (resolved_at)');
    await knex.raw('CREATE INDEX idx_ai_escalations_breach ON ai_escalations (sla_breach)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('ai_escalations');
    await knex.schema.dropTableIfExists('ai_decisions');
};
