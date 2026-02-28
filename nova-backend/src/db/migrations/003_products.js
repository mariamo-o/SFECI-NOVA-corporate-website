// Migration: 003 — Product Catalog & Inventory
'use strict';

exports.up = async (knex) => {
    await knex.schema.createTable('product_categories', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('name', 255).notNullable();
        t.string('slug', 255).notNullable().unique();
        t.string('sector', 100).notNullable();           // industrial, energy, medical, etc.
        t.text('description');
        t.uuid('parent_id').references('id').inTable('product_categories');
        t.integer('sort_order').defaultTo(0);
        t.boolean('is_active').defaultTo(true);
        t.timestamps(true, true);
    });

    await knex.schema.createTable('products', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
        t.uuid('category_id').references('id').inTable('product_categories');
        t.string('name', 500).notNullable();
        t.string('sku', 100).notNullable();
        t.text('description');
        t.jsonb('specifications').defaultTo('{}');
        t.string('unit_of_measure', 50);                 // kg, pcs, m², etc.
        t.decimal('unit_price', 15, 4);
        t.string('currency', 3).defaultTo('EUR');
        t.string('origin_country', 2);                   // ISO 3166-1
        t.string('hs_code', 20);                         // Harmonized System tariff code
        t.boolean('is_compliance_verified').defaultTo(false);
        t.jsonb('compliance_certifications').defaultTo('[]');
        t.boolean('is_active').defaultTo(true);
        t.boolean('is_published').defaultTo(false);
        t.jsonb('images').defaultTo('[]');
        t.jsonb('tags').defaultTo('[]');
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
        t.unique(['vendor_id', 'sku']);
    });

    await knex.schema.createTable('inventory', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE').unique();
        t.integer('quantity_available').notNullable().defaultTo(0);
        t.integer('quantity_reserved').notNullable().defaultTo(0);
        t.integer('minimum_order_quantity').defaultTo(1);
        t.integer('reorder_level').defaultTo(0);
        t.boolean('is_in_stock').notNullable().defaultTo(false);
        t.string('lead_time_days', 50);
        t.timestamp('last_synced_at');
        t.timestamps(true, true);
    });

    await knex.raw('CREATE INDEX idx_products_vendor ON products (vendor_id)');
    await knex.raw('CREATE INDEX idx_products_category ON products (category_id)');
    await knex.raw('CREATE INDEX idx_products_sku ON products (sku)');
    await knex.raw('CREATE INDEX idx_products_active_published ON products (is_active, is_published)');
    await knex.raw('CREATE INDEX idx_inventory_product ON inventory (product_id)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('inventory');
    await knex.schema.dropTableIfExists('products');
    await knex.schema.dropTableIfExists('product_categories');
};
