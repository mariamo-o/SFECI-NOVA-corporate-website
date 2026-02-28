// Migration: 004 — RFQ Lifecycle Engine
'use strict';

exports.up = async (knex) => {
    await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE rfq_status AS ENUM (
        'draft','submitted','notified','quoted','comparing','selected','order_created','closed','rejected','expired'
      );
      CREATE TYPE quote_status AS ENUM ('pending','submitted','accepted','rejected','expired');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

    await knex.schema.createTable('rfqs', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('rfq_number', 50).notNullable().unique(); // e.g. RFQ-2026-000001
        t.uuid('buyer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('title', 500).notNullable();
        t.text('description').notNullable();
        t.string('sector', 100).notNullable();
        t.string('budget_currency', 3).defaultTo('EUR');
        t.decimal('budget_min', 15, 2);
        t.decimal('budget_max', 15, 2);
        t.specificType('status', 'rfq_status').notNullable().defaultTo('draft');
        t.timestamp('submission_deadline');
        t.timestamp('quote_deadline');
        t.timestamp('sla_deadline');                     // System-enforced SLA
        t.boolean('sla_breached').defaultTo(false);
        t.string('delivery_country', 2);
        t.string('delivery_address', 500);
        t.timestamp('required_delivery_date');
        t.jsonb('attachments').defaultTo('[]');
        t.jsonb('tags').defaultTo('[]');
        t.string('ai_category', 100);                   // AI-assigned category
        t.decimal('ai_category_confidence', 5, 2);
        t.uuid('selected_quote_id');                     // FK added after quotes table exists
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('rfq_items', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('rfq_id').notNullable().references('id').inTable('rfqs').onDelete('CASCADE');
        t.string('name', 500).notNullable();
        t.text('specifications');
        t.integer('quantity').notNullable();
        t.string('unit_of_measure', 50);
        t.string('hs_code', 20);
        t.decimal('target_unit_price', 15, 4);
        t.timestamps(true, true);
    });

    await knex.schema.createTable('rfq_quotes', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('rfq_id').notNullable().references('id').inTable('rfqs').onDelete('CASCADE');
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
        t.string('quote_number', 50).notNullable().unique();
        t.specificType('status', 'quote_status').notNullable().defaultTo('pending');
        t.decimal('total_amount', 15, 2).notNullable();
        t.string('currency', 3).defaultTo('EUR');
        t.integer('delivery_days').notNullable();
        t.timestamp('valid_until').notNullable();
        t.text('notes');
        t.jsonb('line_items').defaultTo('[]');           // [{name, qty, unit_price, total}]
        t.jsonb('attachments').defaultTo('[]');
        t.timestamps(true, true);
        t.unique(['rfq_id', 'vendor_id']);
    });

    // Add FK for selected_quote_id now that rfq_quotes exists
    await knex.schema.table('rfqs', (t) => {
        t.foreign('selected_quote_id').references('id').inTable('rfq_quotes');
    });

    // Immutable state transition log
    await knex.schema.createTable('rfq_state_log', (t) => {
        t.bigIncrements('id');
        t.uuid('rfq_id').notNullable().references('id').inTable('rfqs').onDelete('CASCADE');
        t.string('from_status', 50);
        t.string('to_status', 50).notNullable();
        t.uuid('transitioned_by').references('id').inTable('users');
        t.boolean('is_ai_action').defaultTo(false);
        t.text('notes');
        t.jsonb('metadata').defaultTo('{}');
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX idx_rfqs_buyer ON rfqs (buyer_id)');
    await knex.raw('CREATE INDEX idx_rfqs_status ON rfqs (status)');
    await knex.raw('CREATE INDEX idx_rfqs_sector ON rfqs (sector)');
    await knex.raw('CREATE INDEX idx_rfqs_sla_deadline ON rfqs (sla_deadline)');
    await knex.raw('CREATE INDEX idx_rfq_quotes_rfq ON rfq_quotes (rfq_id)');
    await knex.raw('CREATE INDEX idx_rfq_quotes_vendor ON rfq_quotes (vendor_id)');
    await knex.raw('CREATE INDEX idx_rfq_state_log_rfq ON rfq_state_log (rfq_id)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('rfq_state_log');
    await knex.schema.dropTableIfExists('rfq_quotes');
    await knex.schema.dropTableIfExists('rfq_items');
    await knex.schema.dropTableIfExists('rfqs');
    await knex.raw('DROP TYPE IF EXISTS quote_status');
    await knex.raw('DROP TYPE IF EXISTS rfq_status');
};
