// ============================================================
// NOVA Platform — Dispute DB Migration
// Tables: disputes, dispute_evidence, dispute_state_log
// ============================================================
'use strict';

exports.up = async (knex) => {
    // ---- disputes ----
    if (!(await knex.schema.hasTable('disputes'))) {
        await knex.schema.createTable('disputes', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.string('dispute_number', 50).notNullable().unique();
            t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('RESTRICT');
            t.uuid('raised_by').notNullable().references('id').inTable('users');
            t.uuid('against_user').notNullable().references('id').inTable('users');
            t.uuid('assigned_to').nullable().references('id').inTable('users');
            t.enum('status', [
                'opened', 'evidence_collection', 'under_review', 'arbitration',
                'resolved_buyer_favour', 'resolved_vendor_favour', 'resolved_split',
                'closed', 'escalated',
            ]).notNullable().defaultTo('opened');
            t.enum('reason', [
                'non_delivery', 'quality_issue', 'wrong_item', 'payment_dispute',
                'breach_of_contract', 'delivery_delay', 'other',
            ]).notNullable();
            t.text('description').notNullable();
            t.decimal('disputed_amount', 15, 4).nullable();
            t.string('currency', 3).defaultTo('EUR');
            t.decimal('resolution_amount', 15, 4).nullable();
            t.text('resolution_notes').nullable();
            t.timestamp('sla_deadline').nullable();
            t.timestamp('resolved_at').nullable();
            t.jsonb('metadata').defaultTo('{}');
            t.timestamps(true, true);
        });
        await knex.schema.table('disputes', (t) => {
            t.index(['order_id']);
            t.index(['status']);
            t.index(['raised_by']);
            t.index(['sla_deadline']);
        });
    }

    // ---- dispute_evidence ----
    if (!(await knex.schema.hasTable('dispute_evidence'))) {
        await knex.schema.createTable('dispute_evidence', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.uuid('dispute_id').notNullable().references('id').inTable('disputes').onDelete('CASCADE');
            t.uuid('submitted_by').notNullable().references('id').inTable('users');
            t.enum('evidence_type', ['document', 'image', 'communication', 'invoice', 'other']).notNullable();
            t.string('file_name', 255).nullable();
            t.string('file_path', 500).nullable();
            t.string('mime_type', 100).nullable();
            t.text('description').nullable();
            t.timestamps(true, true);
        });
    }

    // ---- dispute_state_log ----
    if (!(await knex.schema.hasTable('dispute_state_log'))) {
        await knex.schema.createTable('dispute_state_log', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.uuid('dispute_id').notNullable().references('id').inTable('disputes').onDelete('CASCADE');
            t.string('from_status', 50).nullable();
            t.string('to_status', 50).notNullable();
            t.uuid('transitioned_by').nullable().references('id').inTable('users');
            t.text('notes').nullable();
            t.timestamp('created_at').defaultTo(knex.fn.now());
        });
    }
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('dispute_state_log');
    await knex.schema.dropTableIfExists('dispute_evidence');
    await knex.schema.dropTableIfExists('disputes');
};
