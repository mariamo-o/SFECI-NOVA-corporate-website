// Migration: 005 — Orders, Payments & Escrow
'use strict';

exports.up = async (knex) => {
    await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM (
        'pending','confirmed','contracted','payment_pending','payment_held',
        'in_fulfillment','shipped','delivered','completed','disputed','refunded','cancelled'
      );
      CREATE TYPE payment_status AS ENUM (
        'pending','authorized','captured','escrowed','released','refunded','failed','disputed'
      );
      CREATE TYPE dispute_status AS ENUM (
        'open','evidence_requested','under_review','resolved_buyer',
        'resolved_vendor','escalated','closed'
      );
      EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

    await knex.schema.createTable('orders', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('order_number', 50).notNullable().unique();
        t.uuid('rfq_id').references('id').inTable('rfqs');
        t.uuid('quote_id').references('id').inTable('rfq_quotes');
        t.uuid('buyer_id').notNullable().references('id').inTable('users');
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
        t.specificType('status', 'order_status').notNullable().defaultTo('pending');
        t.decimal('total_amount', 15, 2).notNullable();
        t.string('currency', 3).defaultTo('EUR');
        t.string('delivery_address', 500);
        t.string('delivery_country', 2);
        t.timestamp('required_delivery_date');
        t.timestamp('shipped_at');
        t.timestamp('delivered_at');
        t.timestamp('completed_at');
        t.string('tracking_number', 255);
        t.string('shipping_carrier', 100);
        t.text('buyer_notes');
        t.text('vendor_notes');
        t.jsonb('contract_data').defaultTo('{}');
        t.string('contract_url', 1000);
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('order_items', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
        t.uuid('product_id').references('id').inTable('products');
        t.string('name', 500).notNullable();
        t.integer('quantity').notNullable();
        t.string('unit', 50);
        t.decimal('unit_price', 15, 4).notNullable();
        t.decimal('total_price', 15, 2).notNullable();
        t.string('currency', 3).defaultTo('EUR');
        t.timestamps(true, true);
    });

    await knex.schema.createTable('order_state_log', (t) => {
        t.bigIncrements('id');
        t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
        t.string('from_status', 50);
        t.string('to_status', 50).notNullable();
        t.uuid('transitioned_by').references('id').inTable('users');
        t.text('notes');
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Payments & Escrow
    await knex.schema.createTable('payments', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
        t.string('payment_reference', 255).unique();
        t.string('gateway', 50).notNullable().defaultTo('stripe');   // abstraction layer
        t.string('gateway_payment_id', 255);                          // e.g. Stripe PaymentIntent ID
        t.string('gateway_customer_id', 255);
        t.specificType('status', 'payment_status').notNullable().defaultTo('pending');
        t.decimal('amount', 15, 2).notNullable();
        t.string('currency', 3).notNullable().defaultTo('EUR');
        t.decimal('platform_fee', 15, 2).defaultTo(0);
        t.decimal('net_amount', 15, 2);
        t.boolean('is_escrowed').defaultTo(false);
        t.timestamp('escrowed_at');
        t.timestamp('released_at');
        t.timestamp('refunded_at');
        t.decimal('refund_amount', 15, 2);
        t.jsonb('gateway_metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    // Dispute management
    await knex.schema.createTable('disputes', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('dispute_number', 50).notNullable().unique();
        t.uuid('order_id').notNullable().references('id').inTable('orders');
        t.uuid('payment_id').references('id').inTable('payments');
        t.uuid('raised_by').notNullable().references('id').inTable('users');
        t.string('reason', 255).notNullable();
        t.text('description').notNullable();
        t.specificType('status', 'dispute_status').notNullable().defaultTo('open');
        t.uuid('assigned_to').references('id').inTable('users');
        t.timestamp('sla_deadline');
        t.boolean('sla_breached').defaultTo(false);
        t.text('resolution_notes');
        t.uuid('resolved_by').references('id').inTable('users');
        t.timestamp('resolved_at');
        t.decimal('refund_amount', 15, 2);
        t.timestamps(true, true);
    });

    // Invoice management
    await knex.schema.createTable('invoices', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('invoice_number', 50).notNullable().unique();
        t.uuid('order_id').notNullable().references('id').inTable('orders');
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
        t.uuid('buyer_id').notNullable().references('id').inTable('users');
        t.decimal('subtotal', 15, 2).notNullable();
        t.decimal('tax_amount', 15, 2).defaultTo(0);
        t.decimal('total_amount', 15, 2).notNullable();
        t.string('currency', 3).defaultTo('EUR');
        t.string('status', 50).defaultTo('draft');      // draft→issued→paid→overdue→cancelled
        t.timestamp('issued_at');
        t.timestamp('due_at');
        t.timestamp('paid_at');
        t.string('pdf_url', 1000);
        t.timestamps(true, true);
    });

    await knex.raw('CREATE INDEX idx_orders_buyer ON orders (buyer_id)');
    await knex.raw('CREATE INDEX idx_orders_vendor ON orders (vendor_id)');
    await knex.raw('CREATE INDEX idx_orders_status ON orders (status)');
    await knex.raw('CREATE INDEX idx_payments_order ON payments (order_id)');
    await knex.raw('CREATE INDEX idx_payments_status ON payments (status)');
    await knex.raw('CREATE INDEX idx_disputes_order ON disputes (order_id)');
    await knex.raw('CREATE INDEX idx_disputes_status ON disputes (status)');
    await knex.raw('CREATE INDEX idx_invoices_order ON invoices (order_id)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('invoices');
    await knex.schema.dropTableIfExists('disputes');
    await knex.schema.dropTableIfExists('payments');
    await knex.schema.dropTableIfExists('order_state_log');
    await knex.schema.dropTableIfExists('order_items');
    await knex.schema.dropTableIfExists('orders');
    await knex.raw('DROP TYPE IF EXISTS dispute_status');
    await knex.raw('DROP TYPE IF EXISTS payment_status');
    await knex.raw('DROP TYPE IF EXISTS order_status');
};
