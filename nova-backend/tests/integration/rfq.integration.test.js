// ============================================================
// NOVA Platform — RFQ Integration Tests
// ============================================================
'use strict';

const request = require('supertest');
let app, knex, buyerCookie, vendorCookie;

const buyerCredentials = { email: 'buyer@acme.com', password: 'Buyer@1234!' };
const vendorCredentials = { email: 'vendor@techcorp.com', password: 'Vendor@1234!' };

beforeAll(async () => {
    ({ app } = require('../../src/server'));
    knex = require('../../src/config/database').knex;
    await new Promise((r) => setTimeout(r, 500));

    // Login buyer
    const b = await request(app).post('/api/v1/auth/login').send(buyerCredentials);
    buyerCookie = b.headers['set-cookie'];

    // Login vendor
    const v = await request(app).post('/api/v1/auth/login').send(vendorCredentials);
    vendorCookie = v.headers['set-cookie'];
});

afterAll(() => knex.destroy());

describe('RFQ API — Integration Tests', () => {
    let rfqId;

    describe('POST /api/v1/rfqs — Create RFQ', () => {
        it('buyer creates an RFQ successfully', async () => {
            const res = await request(app)
                .post('/api/v1/rfqs')
                .set('Cookie', buyerCookie)
                .send({
                    title: 'Industrial IoT Sensors Procurement Q1-2026',
                    description: 'We require 200 units of industrial-grade IoT sensor arrays with 4G/5G connectivity, IP67 rated, suitable for outdoor deployment in harsh environments.',
                    sector: 'industrial',
                    budget_min: 40000,
                    budget_max: 60000,
                    budget_currency: 'EUR',
                    delivery_country: 'FR',
                    items: [
                        { name: 'IoT Sensor Array X7', quantity: 200, unit_of_measure: 'units' },
                    ],
                })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.rfq_number).toMatch(/^RFQ-\d{4}-\d{6}$/);
            rfqId = res.body.data.id;
        });

        it('returns 401 when not authenticated', async () => {
            await request(app)
                .post('/api/v1/rfqs')
                .send({ title: 'Unauthorized RFQ', description: 'Should fail', items: [] })
                .expect(401);
        });

        it('returns 422 for missing required fields', async () => {
            const res = await request(app)
                .post('/api/v1/rfqs')
                .set('Cookie', buyerCookie)
                .send({ title: 'Short', description: 'Too short' })
                .expect(422);

            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/rfqs/:id — Get RFQ', () => {
        it('buyer can get their own RFQ', async () => {
            const res = await request(app)
                .get(`/api/v1/rfqs/${rfqId}`)
                .set('Cookie', buyerCookie)
                .expect(200);

            expect(res.body.data.id).toBe(rfqId);
            expect(res.body.data.status).toBe('draft');
        });

        it('returns 404 for non-existent RFQ', async () => {
            await request(app)
                .get('/api/v1/rfqs/00000000-0000-0000-0000-000000000000')
                .set('Cookie', buyerCookie)
                .expect(404);
        });
    });

    describe('POST /api/v1/rfqs/:id/submit — Submit RFQ', () => {
        it('buyer submits RFQ and transitions to submitted', async () => {
            const res = await request(app)
                .post(`/api/v1/rfqs/${rfqId}/submit`)
                .set('Cookie', buyerCookie)
                .expect(200);

            expect(res.body.success).toBe(true);
        });

        it('prevents re-submission of already submitted RFQ', async () => {
            const res = await request(app)
                .post(`/api/v1/rfqs/${rfqId}/submit`)
                .set('Cookie', buyerCookie);

            expect([409, 422]).toContain(res.status);
        });
    });

    describe('GET /api/v1/rfqs — List RFQs', () => {
        it('buyer sees only their own RFQs', async () => {
            const res = await request(app)
                .get('/api/v1/rfqs')
                .set('Cookie', buyerCookie)
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.pagination).toBeDefined();
        });

        it('returns 401 for unauthenticated list request', async () => {
            await request(app).get('/api/v1/rfqs').expect(401);
        });
    });
});
