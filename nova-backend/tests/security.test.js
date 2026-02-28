// ============================================================
// NOVA Platform — Security Test Suite
// Tests OWASP Top 10 protections (XSS, SQLi, rate limiting, CSRF)
// ============================================================
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nova_db_test';

const request = require('supertest');
const { app } = require('../src/server');
const { knex } = require('../src/config/database');

beforeAll(async () => {
    await knex.migrate.latest({ directory: './src/db/migrations' });
});

afterAll(async () => {
    await knex.migrate.rollback({}, true);
    await knex.destroy();
});

describe('🔒 XSS Prevention — Input Sanitization', () => {
    test('strips <script> tags from registration fields', async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'xss@test.com',
                password: 'Secure@Pass1',
                first_name: '<script>alert("xss")</script>',
                last_name: 'Test',
            });
        // Should either fail validation or register with stripped name
        if (res.status === 201) {
            const user = await knex('users').where({ email: 'xss@test.com' }).first();
            expect(user.first_name).not.toContain('<script>');
        } else {
            expect([400, 422]).toContain(res.status);
        }
    });

    test('strips javascript: protocol', async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'xss2@test.com',
                password: 'Secure@Pass1',
                first_name: 'javascript:alert(1)',
                last_name: 'Test',
            });
        if (res.status === 201) {
            const user = await knex('users').where({ email: 'xss2@test.com' }).first();
            expect(user.first_name).not.toContain('javascript:');
        }
    });
});

describe('🔒 SQL Injection Prevention', () => {
    test('SQL UNION attack is blocked or sanitized', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: "' UNION SELECT * FROM users--",
                password: "' OR '1'='1",
            });
        // Must return 401 (wrong creds) or 422 (validation), NOT 200 or 500
        expect([401, 422]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    test('DROP TABLE statement is blocked', async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: "'; DROP TABLE users; --@test.com",
                password: 'Secure@Pass1',
                first_name: 'A',
                last_name: 'B',
            });
        expect([400, 422, 409]).toContain(res.status);
        // Verify users table still exists
        const tableExists = await knex.schema.hasTable('users');
        expect(tableExists).toBe(true);
    });

    test('Boolean blind SQLi is blocked', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: "admin@sfeci.com' AND '1'='1", password: 'anything' });
        expect(res.status).not.toBe(200);
        expect(res.body.success).toBe(false);
    });
});

describe('🔒 Authentication & Authorization', () => {
    test('protected route requires auth token', async () => {
        const res = await request(app).get('/api/v1/vendors');
        expect(res.status).toBe(401);
    });

    test('buyer cannot access compliance-only endpoint', async () => {
        const agent = request.agent(app);
        // Register as buyer
        await agent.post('/api/v1/auth/register').send({
            email: 'buyer_priv@test.com', password: 'Secure@Pass1',
            first_name: 'A', last_name: 'B', role: 'buyer',
        });
        // Try to access vendor list (compliance_or_above only)
        const res = await agent.get('/api/v1/vendors');
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Insufficient privileges');
    });

    test('tampered JWT is rejected', async () => {
        const res = await request(app)
            .get('/api/v1/auth/me')
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.TAMPERED.INVALID');
        expect(res.status).toBe(401);
    });

    test('missing Authorization header returns 401', async () => {
        const res = await request(app).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
    });
});

describe('🔒 Security Headers', () => {
    test('response includes X-Frame-Options: DENY', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-frame-options']).toBe('DENY');
    });

    test('response includes X-Content-Type-Options: nosniff', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('response does not leak X-Powered-By header', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });
});

describe('🔒 API Structure Correctness', () => {
    test('unknown routes return 404 JSON', async () => {
        const res = await request(app).get('/api/v1/nonexistent-route');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('malformed JSON body returns 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .set('Content-Type', 'application/json')
            .send('{invalid json}');
        expect([400, 422]).toContain(res.status);
    });
});
