// Migration: 008 — Analytics Events & Snapshots
// Enables event-driven analytics pipeline and daily aggregates.
'use strict';

exports.up = async (knex) => {
    // Event stream — every significant platform action
    await knex.schema.createTable('platform_events', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.string('event_type', 100).notNullable();          // e.g. RFQ_CREATED, QUOTE_SUBMITTED
        t.string('entity_type', 100).notNullable();         // e.g. rfq, order, vendor
        t.uuid('entity_id');
        t.uuid('actor_id');                                  // User who triggered event (nullable for system)
        t.jsonb('payload').defaultTo('{}');                  // Contextual data
        t.string('tenant_id', 100);                          // For multi-tenancy
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });

    // Pre-aggregated analytics snapshots (computed daily by CRON)
    await knex.schema.createTable('analytics_snapshots', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.date('snapshot_date').notNullable();
        t.string('metric_key', 200).notNullable();           // e.g. rfq.conversion_rate, gmv.daily
        t.decimal('metric_value', 20, 6);
        t.jsonb('dimensions').defaultTo('{}');               // e.g. { sector: 'energy', country: 'FR' }
        t.string('group_by', 100);                           // e.g. 'sector', 'country', 'vendor'
        t.timestamps(true, true);
        t.unique(['snapshot_date', 'metric_key', 'group_by']);
    });

    // Indexes for fast event querying
    await knex.raw('CREATE INDEX idx_events_type ON platform_events (event_type)');
    await knex.raw('CREATE INDEX idx_events_entity ON platform_events (entity_type, entity_id)');
    await knex.raw('CREATE INDEX idx_events_actor ON platform_events (actor_id)');
    await knex.raw('CREATE INDEX idx_events_created ON platform_events (created_at DESC)');
    await knex.raw('CREATE INDEX idx_events_tenant ON platform_events (tenant_id)');
    await knex.raw('CREATE INDEX idx_snapshots_date_key ON analytics_snapshots (snapshot_date, metric_key)');
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('analytics_snapshots');
    await knex.schema.dropTableIfExists('platform_events');
};
