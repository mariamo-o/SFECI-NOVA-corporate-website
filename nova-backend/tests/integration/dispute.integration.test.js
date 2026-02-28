// ============================================================
// NOVA Platform — Dispute Integration Tests
// ============================================================
'use strict';

const request = require('supertest');
let app, knex;
let buyerCookie, adminCookie;

beforeAll(async () => {
    ({ app } = require('../../src/server'));
    knex = require('../../src/config/database').knex;
    await new Promise((r) => setTimeout(r, 500));

    const b = await request(app).post('/api/v1/auth/login').send({ email: 'buyer@acme.com', password: 'Buyer@1234!' });
    buyerCookie = b.headers['set-cookie'];

    const a = await request(app).post('/api/v1/auth/login').send({ email: 'admin@sfeci.com', password: 'Admin@1234!' });
    adminCookie = a.headers['set-cookie'];
});

afterAll(() => knex.destroy());

describe('Dispute API — Integration Tests', () => {
    describe('GET /api/v1/trade/disputes', () => {
        it('returns 401 for unauthenticated request', async () => {
            await request(app).get('/api/v1/trade/disputes').expect(401);
        });

        it('buyer can list disputes (empty on clean DB)', async () => {
            const res = await request(app)
                .get('/api/v1/trade/disputes')
                .set('Cookie', buyerCookie)
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    describe('GET /api/v1/trade/disputes/:id', () => {
        it('returns 404 for non-existent dispute', async () => {
            await request(app)
                .get('/api/v1/trade/disputes/00000000-0000-0000-0000-000000000000')
                .set('Cookie', adminCookie)
                .expect(404);
        });
    });

    describe('POST /api/v1/trade/disputes — Open dispute', () => {
        it('returns 422 for invalid orderId', async () => {
            const res = await request(app)
                .post('/api/v1/trade/disputes')
                .set('Cookie', buyerCookie)
                .send({
                    orderId: 'not-a-uuid',
                    reason: 'non_delivery',
                    description: 'The order was never delivered after 30 days of waiting beyond the agreed delivery date.',
                })
                .expect(422);

            expect(res.body.success).toBe(false);
        });

        it('returns 401 when unauthenticated', async () => {
            await request(app)
                .post('/api/v1/trade/disputes')
                .send({ orderId: '00000000-0000-0000-0000-000000000000', reason: 'non_delivery', description: 'Test' })
                .expect(401);
        });
    });
});
