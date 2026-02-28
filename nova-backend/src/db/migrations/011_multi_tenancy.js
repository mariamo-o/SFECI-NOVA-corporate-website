// Migration: 011 — Multi-Tenancy
// Adds tenants table and tenant_id to core entity tables.
'use strict';

exports.up = async (knex) => {
    // Create tenant_plan ENUM
    await knex.raw(`
        DO $$ BEGIN
            CREATE TYPE tenant_plan AS ENUM ('starter','growth','enterprise');
            EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    `);

    // Core tenants table
    if (!(await knex.schema.hasTable('tenants'))) {
        await knex.schema.createTable('tenants', (t) => {
            t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            t.string('name', 255).notNullable();
            t.string('brand_name', 255);
            t.string('domain', 255).unique();
            t.string('subdomain', 100).unique();
            t.specificType('plan', 'tenant_plan').defaultTo('starter');
            t.jsonb('settings').defaultTo('{}');
            t.boolean('is_active').defaultTo(true);
            t.timestamps(true, true);
        });
    }

    // Insert default system tenant (ignore conflict if already exists)
    await knex.raw(`
        INSERT INTO tenants (id, name, brand_name, domain, subdomain, plan, is_active, created_at, updated_at)
        VALUES (
            '00000000-0000-0000-0000-000000000001',
            'SFECI', 'SFECI NOVA Platform', 'sfeci.com', 'sfeci', 'enterprise', true,
            NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING;
    `);

    // Add tenant_id FK to core tables using safe raw SQL
    const tables = ['users', 'vendors', 'rfqs', 'orders', 'disputes', 'invoices', 'products'];
    const defaultTenantId = '00000000-0000-0000-0000-000000000001';

    for (const table of tables) {
        if (!(await knex.schema.hasTable(table))) continue;
        if (await knex.schema.hasColumn(table, 'tenant_id')) continue;  // already added

        // Add nullable tenant_id column with FK
        await knex.raw(`
            ALTER TABLE ${table}
            ADD COLUMN tenant_id uuid REFERENCES tenants(id) DEFAULT '${defaultTenantId}';
        `);

        // Backfill NULL rows
        await knex.raw(`
            UPDATE ${table} SET tenant_id = '${defaultTenantId}' WHERE tenant_id IS NULL;
        `);

        // Safe index create
        await knex.raw(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
    }
};

exports.down = async (knex) => {
    const tables = ['users', 'vendors', 'rfqs', 'orders', 'disputes', 'invoices', 'products'];
    for (const table of tables) {
        if (await knex.schema.hasTable(table)) {
            await knex.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tenant_id`);
        }
    }
    await knex.schema.dropTableIfExists('tenants');
    await knex.raw('DROP TYPE IF EXISTS tenant_plan');
};
