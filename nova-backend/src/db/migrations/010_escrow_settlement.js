// Migration: 010 — Escrow & Settlement Framework
// Tables: escrow_accounts, settlement_cycles, reconciliation_reports
'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('escrow_accounts', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE').unique();
        t.decimal('amount', 15, 4).notNullable();
        t.string('currency', 3).defaultTo('EUR');
        t.enu('status', ['pending', 'funded', 'released', 'refunded', 'disputed'], {
            useNative: true, enumName: 'escrow_status',
        }).notNullable().defaultTo('pending');
        t.string('stripe_payment_intent_id', 255);          // Stripe Connect holds funds in escrow
        t.timestamp('funded_at');
        t.timestamp('released_at');
        t.timestamp('refunded_at');
        t.text('refund_reason');
        t.uuid('released_by').references('id').inTable('users');
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('settlement_cycles', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('escrow_id').notNullable().references('id').inTable('escrow_accounts').onDelete('CASCADE');
        t.enu('cycle_type', ['T1', 'T2', 'T3'], {
            useNative: true, enumName: 'settlement_cycle_type',
        }).notNullable().defaultTo('T2');  // T+2 default
        t.date('settle_date').notNullable();
        t.enu('status', ['scheduled', 'processing', 'settled', 'failed'], {
            useNative: true, enumName: 'settlement_status',
        }).notNullable().defaultTo('scheduled');
        t.text('failure_reason');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('reconciliation_reports', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.date('period_start').notNullable();
        t.date('period_end').notNullable();
        t.decimal('total_settled', 15, 4).defaultTo(0);
        t.decimal('total_refunded', 15, 4).defaultTo(0);
        t.decimal('total_disputed', 15, 4).defaultTo(0);
        t.integer('transaction_count').defaultTo(0);
        t.jsonb('discrepancies').defaultTo('[]');            // Array of mismatched records
        t.uuid('generated_by').references('id').inTable('users');
        t.timestamp('generated_at').defaultTo(knex.fn.now());
        t.timestamps(true, true);
    });

    await knex.raw('CREATE INDEX idx_escrow_order ON escrow_accounts (order_id)');
    await knex.raw('CREATE INDEX idx_escrow_status ON escrow_accounts (status)');
    await knex.raw('CREATE INDEX idx_settlement_escrow ON settlement_cycles (escrow_id)');
    await knex.raw('CREATE INDEX idx_settlement_date ON settlement_cycles (settle_date)');
    await knex.raw('CREATE INDEX idx_recon_period ON reconciliation_reports (period_start, period_end)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('reconciliation_reports');
    await knex.schema.dropTableIfExists('settlement_cycles');
    await knex.schema.dropTableIfExists('escrow_accounts');
    await knex.raw('DROP TYPE IF EXISTS escrow_status');
    await knex.raw('DROP TYPE IF EXISTS settlement_cycle_type');
    await knex.raw('DROP TYPE IF EXISTS settlement_status');
};
