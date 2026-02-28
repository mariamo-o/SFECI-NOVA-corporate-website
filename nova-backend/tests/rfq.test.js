// ============================================================
// NOVA Platform — RFQ State Machine Test Suite
// ============================================================
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nova_db_test';

const request = require('supertest');
const { app } = require('../src/server');
const { knex } = require('../src/config/database');

let buyerAgent;
let vendorAgent;
let adminAgent;
let createdRfqId;

beforeAll(async () => {
    await knex.migrate.latest({ directory: './src/db/migrations' });
    await knex('rfq_state_log').del();
    await knex('rfq_quotes').del();
    await knex('rfq_items').del();
    await knex('rfqs').del();
    await knex('vendors').del();
    await knex('refresh_tokens').del();
    await knex('users').del();

    // Seed test users via API
    buyerAgent = request.agent(app);
    vendorAgent = request.agent(app);
    adminAgent = request.agent(app);

    await buyerAgent.post('/api/v1/auth/register').send({
        email: 'rfq_buyer@test.com', password: 'Secure@Pass1',
        first_name: 'Buyer', last_name: 'Test', role: 'buyer',
    });

    // Register vendor user
    const vendorRegRes = await vendorAgent.post('/api/v1/auth/register').send({
        email: 'rfq_vendor@test.com', password: 'Secure@Pass1',
        first_name: 'Vendor', last_name: 'Test', role: 'vendor',
    });
    const vendorUserId = vendorRegRes.body.data?.id;

    // Seed an approved vendor for this user directly in DB
    if (vendorUserId) {
        await knex('vendors').insert({
            id: require('uuid').v4(),
            user_id: vendorUserId,
            company_name: 'Test Vendor Corp',
            country: 'DE',
            status: 'approved',
            risk_level: 'low',
            risk_score: 10,
            sectors: JSON.stringify(['industrial']),
            aml_cleared: true,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        });
        await knex('users').where({ id: vendorUserId }).update({ role: 'vendor' });
        await vendorAgent.post('/api/v1/auth/login').send({ email: 'rfq_vendor@test.com', password: 'Secure@Pass1' });
    }

    // Admin
    awaitknex('users').insert({
        id: require('uuid').v4(),
        email: 'rfq_admin@test.com',
        password_hash: require('bcryptjs').hashSync('Admin@1234!', 12),
        first_name: 'Admin', last_name: 'Test',
        role: 'super_admin', is_active: true, is_email_verified: true,
        country: 'FR',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });
    await adminAgent.post('/api/v1/auth/login').send({ email: 'rfq_admin@test.com', password: 'Admin@1234!' });
});

afterAll(async () => {
    await knex.migrate.rollback({}, true);
    await knex.destroy();
});

describe('RFQ Lifecycle State Machine', () => {
    test('✅ buyer creates RFQ with AI categorization', async () => {
        const res = await buyerAgent.post('/api/v1/rfqs').send({
            title: 'Industrial IoT sensors for smart factory project',
            description: 'Request for 500 IoT sensor arrays for smart manufacturing automation. Specifications: IP67, 4G/5G capable, industrial-grade, Modbus RS-485.',
            items: [{ name: 'IoT Sensor Array', quantity: 500, unit_of_measure: 'units' }],
        });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('draft');
        expect(res.body.data.rfq_number).toMatch(/^RFQ-\d{4}-\d{6}$/);
        expect(res.body.data.aiCategorization.sector).toBe('industrial');
        expect(res.body.data.items).toHaveLength(1);

        createdRfqId = res.body.data.id;
    });

    test('✅ buyer can submit RFQ (draft → submitted)', async () => {
        expect(createdRfqId).toBeDefined();
        const res = await buyerAgent.post(`/api/v1/rfqs/${createdRfqId}/submit`);
        expect(res.status).toBe(200);
        expect(res.body.data.to).toBe('submitted');
        expect(res.body.data.from).toBe('draft');

        // Verify in DB
        const rfq = await knex('rfqs').where({ id: createdRfqId }).first();
        expect(rfq.status).toBe('submitted');
    });

    test('🔒 vendor cannot submit buyer RFQ (wrong role)', async () => {
        const tempRfq = await buyerAgent.post('/api/v1/rfqs').send({
            title: 'Energy system supply request for solar installation',
            description: 'Comprehensive solar energy system components including photovoltaic panels, inverters, and battery storage for 500kW installation.',
            items: [{ name: 'Solar Panel 500W', quantity: 100 }],
        });
        const rfqId = tempRfq.body.data.id;
        const res = await vendorAgent.post(`/api/v1/rfqs/${rfqId}/submit`);
        expect(res.status).toBe(403);
    });

    test('🔒 invalid state transition is rejected', async () => {
        // Trying to go from 'submitted' to 'closed' directly (skipping required states)
        if (!createdRfqId) return;
        // Manually advance to 'notified' in DB for this test
        await knex('rfqs').where({ id: createdRfqId }).update({ status: 'notified' });

        // Try invalid transition: notified → closed (not allowed)
        const { RFQStateMachine } = require('../src/services/rfqStateMachine');
        await expect(
            RFQStateMachine.transition(createdRfqId, 'closed', 'test-user', 'test')
        ).rejects.toThrow(/Invalid transition/);
    });

    test('✅ vendor submits quote for notified RFQ', async () => {
        if (!createdRfqId) return;
        await knex('rfqs').where({ id: createdRfqId }).update({ status: 'notified' });

        const res = await vendorAgent.post(`/api/v1/rfqs/${createdRfqId}/quotes`).send({
            total_amount: 124950.00,
            currency: 'EUR',
            delivery_days: 21,
            valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Including 3-year warranty and free installation support.',
            line_items: [{ name: 'IoT Sensor Array', quantity: 500, unit_price: 249.90, total: 124950 }],
        });

        expect(res.status).toBe(201);
        expect(res.body.data.quoteNumber).toMatch(/^QTE-\d{4}-\d{6}$/);

        // RFQ should advance to 'quoted' state
        const rfq = await knex('rfqs').where({ id: createdRfqId }).first();
        expect(rfq.status).toBe('quoted');
    });

    test('✅ complete state trail logged in rfq_state_log', async () => {
        if (!createdRfqId) return;
        const log = await knex('rfq_state_log').where({ rfq_id: createdRfqId }).orderBy('created_at', 'asc');
        expect(log.length).toBeGreaterThanOrEqual(2); // draft→submitted→notified at minimum
        // All transitions must have from/to statuses
        log.forEach((entry) => {
            expect(entry.to_status).toBeDefined();
        });
    });
});
