// ============================================================
// NOVA Platform — Auth Integration Tests
// End-to-end tests via HTTP: register, login, logout, 2FA
// ============================================================
'use strict';

const request = require('supertest');
let app;

beforeAll(async () => {
    // Import after NODE_ENV=test is set by setup.js
    ({ app } = require('../../src/server'));
    // Allow server to initialize
    await new Promise((r) => setTimeout(r, 500));
});

afterAll(async () => {
    // Database connections closed by server graceful shutdown hooks
    const { knex } = require('../../src/config/database');
    await knex.destroy();
});

describe('Auth API — Integration Tests', () => {
    const testUser = {
        email: `test_${Date.now()}@example.com`,
        password: 'TestPass@123!',
        first_name: 'Integration',
        last_name: 'Tester',
        role: 'buyer',
    };
    let accessCookie;

    // ---- Registration ----
    describe('POST /api/v1/auth/register', () => {
        it('creates a new user and returns 201', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send(testUser)
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.email).toBe(testUser.email);
            expect(res.body.data.role).toBe('buyer');
            expect(res.body.data).not.toHaveProperty('password_hash');
        });

        it('returns 409 when email already registered', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send(testUser)
                .expect(409);

            expect(res.body.success).toBe(false);
            expect(res.body.error).toMatch(/already registered/i);
        });

        it('returns 422 for weak password', async () => {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ ...testUser, email: `new_${Date.now()}@test.com`, password: 'short' })
                .expect(422);

            expect(res.body.success).toBe(false);
        });

        it('returns 422 when email is invalid', async () => {
            await request(app)
                .post('/api/v1/auth/register')
                .send({ ...testUser, email: 'not-an-email' })
                .expect(422);
        });
    });

    // ---- Login ----
    describe('POST /api/v1/auth/login', () => {
        it('authenticates and returns JWT cookie', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: testUser.email, password: testUser.password })
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.role).toBe('buyer');

            // Cookies should be set
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            accessCookie = cookies;
        });

        it('rejects wrong password with 401', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: testUser.email, password: 'WrongPass@99!' })
                .expect(401);

            expect(res.body.success).toBe(false);
        });

        it('rejects non-existent user with 401', async () => {
            await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'nobody@nowhere.com', password: 'Pass@1234!' })
                .expect(401);
        });
    });

    // ---- Protected Route: GET /me ----
    describe('GET /api/v1/auth/me', () => {
        it('returns user profile when authenticated', async () => {
            const res = await request(app)
                .get('/api/v1/auth/me')
                .set('Cookie', accessCookie)
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.email).toBe(testUser.email);
        });

        it('returns 401 when not authenticated', async () => {
            await request(app).get('/api/v1/auth/me').expect(401);
        });
    });

    // ---- Logout ----
    describe('POST /api/v1/auth/logout', () => {
        it('clears auth cookies', async () => {
            const res = await request(app)
                .post('/api/v1/auth/logout')
                .set('Cookie', accessCookie)
                .expect(200);

            expect(res.body.success).toBe(true);

            // Verify cookies are cleared
            const cookies = res.headers['set-cookie'] || [];
            const hasExpired = cookies.some((c) =>
                c.includes('access_token') && c.includes('Expires=Thu, 01 Jan 1970')
            );
            expect(hasExpired).toBe(true);
        });
    });

    // ---- Security ----
    describe('Security Controls', () => {
        it('has security headers on all responses', async () => {
            const res = await request(app).get('/api/v1/auth/me');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBeDefined();
        });

        it('rejects SQL injection in email field', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: "' OR '1'='1", password: 'anything' });
            expect([400, 401, 422]).toContain(res.status);
        });

        it('returns 404 for unknown routes', async () => {
            await request(app).get('/api/v1/nonexistent-route').expect(404);
        });
    });
});
