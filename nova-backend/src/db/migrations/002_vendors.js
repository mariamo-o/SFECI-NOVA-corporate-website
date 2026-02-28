// Migration: 002 — Vendors & Onboarding
'use strict';

exports.up = async (knex) => {
    await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE vendor_status AS ENUM (
        'registered','docs_submitted','kyc_review',
        'risk_scored','board_review','approved','rejected','suspended'
      );
      CREATE TYPE vendor_risk_level AS ENUM ('low','medium','high','critical');
      EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

    await knex.schema.createTable('vendors', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('company_name', 255).notNullable();
        t.string('trade_name', 255);
        t.string('registration_number', 100);
        t.string('vat_number', 100);
        t.string('country', 2).notNullable();            // ISO 3166-1 alpha-2
        t.string('address', 500);
        t.string('city', 100);
        t.string('postal_code', 20);
        t.string('website', 500);
        t.text('description');
        t.specificType('status', 'vendor_status').notNullable().defaultTo('registered');
        t.specificType('risk_level', 'vendor_risk_level');
        t.decimal('risk_score', 5, 2);                   // 0-100
        t.jsonb('sectors').defaultTo('[]');              // Array of sector keys
        t.jsonb('certifications').defaultTo('[]');        // ISO, etc.
        t.jsonb('sanction_check_result').defaultTo('{}');
        t.jsonb('kyc_data').defaultTo('{}');
        t.boolean('aml_cleared').defaultTo(false);
        t.uuid('reviewed_by').references('id').inTable('users');
        t.uuid('approved_by').references('id').inTable('users');
        t.timestamp('approved_at');
        t.text('rejection_reason');
        t.jsonb('metadata').defaultTo('{}');
        t.timestamps(true, true);
    });

    // Legal documents uploaded by vendor
    await knex.schema.createTable('vendor_documents', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
        t.string('document_type', 100).notNullable();    // e.g. 'registration','vat','iso_cert'
        t.string('filename', 500).notNullable();
        t.string('storage_path', 1000).notNullable();
        t.string('mime_type', 100).notNullable();
        t.integer('size_bytes').notNullable();
        t.boolean('is_verified').defaultTo(false);
        t.uuid('verified_by').references('id').inTable('users');
        t.timestamp('verified_at');
        t.timestamp('expires_at');                       // Document expiry
        t.timestamps(true, true);
    });

    // Audit trail of risk scoring decisions
    await knex.schema.createTable('vendor_risk_scores', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
        t.decimal('score', 5, 2).notNullable();
        t.specificType('risk_level', 'vendor_risk_level').notNullable();
        t.jsonb('score_factors').notNullable().defaultTo('{}');
        t.uuid('scored_by').references('id').inTable('users');  // null = AI-scored
        t.boolean('is_ai_scored').notNullable().defaultTo(true);
        t.decimal('ai_confidence', 5, 2);
        t.text('notes');
        t.timestamps(true, true);
    });

    // Board workflow approvals
    await knex.schema.createTable('board_approvals', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('resource_type', 100).notNullable();    // 'vendor', 'rfq', etc.
        t.uuid('resource_id').notNullable();
        t.string('action_required', 100).notNullable();
        t.string('status', 50).notNullable().defaultTo('pending');
        t.uuid('requested_by').references('id').inTable('users');
        t.uuid('reviewed_by').references('id').inTable('users');
        t.timestamp('reviewed_at');
        t.text('review_notes');
        t.timestamp('deadline_at');
        t.timestamps(true, true);
    });

    await knex.raw('CREATE INDEX idx_vendors_status ON vendors (status)');
    await knex.raw('CREATE INDEX idx_vendors_user_id ON vendors (user_id)');
    await knex.raw('CREATE INDEX idx_vendors_country ON vendors (country)');
    await knex.raw('CREATE INDEX idx_vendor_docs_vendor_id ON vendor_documents (vendor_id)');
    await knex.raw('CREATE INDEX idx_board_approvals_resource ON board_approvals (resource_type, resource_id)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('board_approvals');
    await knex.schema.dropTableIfExists('vendor_risk_scores');
    await knex.schema.dropTableIfExists('vendor_documents');
    await knex.schema.dropTableIfExists('vendors');
    await knex.raw('DROP TYPE IF EXISTS vendor_risk_level');
    await knex.raw('DROP TYPE IF EXISTS vendor_status');
};
