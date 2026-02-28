// Migration: 001 — Core Users & Auth
'use strict';

exports.up = async (knex) => {
    // Enum types
    await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('guest','buyer','vendor','compliance_officer','admin','super_admin');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

    await knex.schema.createTable('users', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('email', 255).notNullable().unique();
        t.string('password_hash', 255).notNullable();
        t.string('first_name', 100).notNullable();
        t.string('last_name', 100).notNullable();
        t.string('phone', 30);
        t.string('country', 2);                          // ISO 3166-1 alpha-2
        t.specificType('role', 'user_role').notNullable().defaultTo('buyer');
        t.boolean('is_active').notNullable().defaultTo(true);
        t.boolean('is_email_verified').notNullable().defaultTo(false);
        t.boolean('two_fa_enabled').notNullable().defaultTo(false);
        t.string('two_fa_secret', 255);                  // TOTP secret (encrypted)
        t.timestamp('email_verified_at');
        t.timestamp('last_login_at');
        t.timestamp('password_changed_at');
        t.string('email_verify_token', 255);
        t.string('password_reset_token', 255);
        t.timestamp('password_reset_expires');
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    // Refresh token store
    await knex.schema.createTable('refresh_tokens', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.text('token_hash').notNullable();              // bcrypt hash of refresh token
        t.string('device_info', 500);
        t.string('ip_address', 45);
        t.boolean('is_revoked').notNullable().defaultTo(false);
        t.timestamp('expires_at').notNullable();
        t.timestamps(true, true);
    });

    // Audit log — APPEND-ONLY, no updates or deletes ever
    await knex.schema.createTable('audit_log', (t) => {
        t.bigIncrements('id');
        t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
        t.string('action', 100).notNullable();
        t.string('resource_type', 100).notNullable();
        t.string('resource_id', 255);
        t.jsonb('old_data');
        t.jsonb('new_data');
        t.jsonb('metadata').defaultTo('{}');
        t.string('ip_address', 45);
        t.string('user_agent', 500);
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // Indexes
    await knex.raw('CREATE INDEX idx_users_email ON users (email)');
    await knex.raw('CREATE INDEX idx_users_role ON users (role)');
    await knex.raw('CREATE INDEX idx_audit_log_user_id ON audit_log (user_id)');
    await knex.raw('CREATE INDEX idx_audit_log_action ON audit_log (action)');
    await knex.raw('CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id)');
    await knex.raw('CREATE INDEX idx_audit_log_created_at ON audit_log (created_at)');
    await knex.raw('CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('refresh_tokens');
    await knex.schema.dropTableIfExists('audit_log');
    await knex.schema.dropTableIfExists('users');
    await knex.raw('DROP TYPE IF EXISTS user_role');
};
