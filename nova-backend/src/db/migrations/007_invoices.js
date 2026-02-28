// Migration: 007 — Invoice Lifecycle
// Migration 005 created a basic invoices table with string status + total_amount.
// This migration adds missing columns and creates child tables.
// Uses raw SQL for safe conditional column additions.
'use strict';

exports.up = async (knex) => {
    // 1. Create invoice_status ENUM type (safe — ignores if already exists)
    await knex.raw(`
        DO $$ BEGIN
            CREATE TYPE invoice_status AS ENUM ('draft','issued','paid','overdue','cancelled');
            EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    `);

    // 2. Add missing columns to invoices using raw SQL with IF NOT EXISTS guard
    const addColIfMissing = async (col, definition) => {
        await knex.raw(`
            DO $$ BEGIN
                ALTER TABLE invoices ADD COLUMN ${col} ${definition};
                EXCEPTION WHEN duplicate_column THEN null;
            END $$;
        `);
    };

    await addColIfMissing('tax_rate', 'decimal(5,4) DEFAULT 0');
    await addColIfMissing('due_date', 'timestamptz');
    await addColIfMissing('notes', 'text');
    await addColIfMissing('metadata', "jsonb DEFAULT '{}'");

    // 3. Add indexes (safe with IF NOT EXISTS)
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices (vendor_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_invoices_buyer  ON invoices (buyer_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_invoices_due    ON invoices (due_at)');

    // 4. Create invoice_line_items
    if (!(await knex.schema.hasTable('invoice_line_items'))) {
        await knex.schema.createTable('invoice_line_items', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
            t.uuid('product_id').references('id').inTable('products');
            t.string('description', 1000).notNullable();
            t.integer('quantity').notNullable().defaultTo(1);
            t.decimal('unit_price', 15, 4).notNullable();
            t.decimal('line_total', 15, 4).notNullable();
            t.string('unit_of_measure', 50);
            t.timestamps(true, true);
        });
        await knex.raw('CREATE INDEX idx_invoice_items_invoice ON invoice_line_items (invoice_id)');
    }

    // 5. Create credit_notes
    if (!(await knex.schema.hasTable('credit_notes'))) {
        await knex.schema.createTable('credit_notes', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.string('credit_note_number', 50).notNullable().unique();
            t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
            t.decimal('amount', 15, 4).notNullable();
            t.string('currency', 3).defaultTo('EUR');
            t.text('reason').notNullable();
            t.timestamp('issued_at').defaultTo(knex.fn.now());
            t.uuid('issued_by').references('id').inTable('users');
            t.timestamps(true, true);
        });
        await knex.raw('CREATE INDEX idx_credit_notes_invoice ON credit_notes (invoice_id)');
    }
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('credit_notes');
    await knex.schema.dropTableIfExists('invoice_line_items');
    // Remove added columns
    await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS tax_rate');
    await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS due_date');
    await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS notes');
    await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS metadata');
    await knex.raw('DROP TYPE IF EXISTS invoice_status');
};
