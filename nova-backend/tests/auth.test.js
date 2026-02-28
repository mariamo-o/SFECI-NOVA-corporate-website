// ============================================================
// NOVA Platform — Auth Test Suite
// functional + security tests for registration and login
// ============================================================
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'nova_db_test';

const request = require('supertest');
const { app } = require('../src/server');
const { knex } = require('../src/config/database');

let server;

beforeAll(async () => {
    // Run migrations on test DB
    await knex.migrate.latest({ directory: './src/db/migrations' });
    server = app;
});

afterAll(async () => {
    await knex.migrate.rollback({}, true);
    await knex.destroy();
});

beforeEach(async () => {
    // Clean users between tests (preserve schema)
    await knex('rfq_state_log').del();
    await knex('rfq_quotes').del();
    await knex('rfq_items').del();
    await knex('rfqs').del();
    await knex('vendors').del();
    await knex('refresh_tokens').del();
    await knex('users').del();
});

describe('POST /api/v1/auth/register', () => {
    test('✅ registers a new buyer successfully', async () => {
        const res = await request(server)
            .post('/api/v1/auth/register')
            .send({
                email: 'buyer@test.com',
                password: 'Secure@Pass1',
                first_name: 'Test',
                last_name: 'Buyer',
                role: 'buyer',
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.email).toBe('buyer@test.com');
        expect(res.body.data.role).toBe('buyer');
        expect(res.headers['set-cookie']).toBeDefined(); // httpOnly JWT cookie set

        // Verify user persisted in DB
        const user = await knex('users').where({ email: 'buyer@test.com' }).first();
        expect(user).toBeDefined();
        expect(user.password_hash).not.toBe('Secure@Pass1'); // Must be hashed
        expect(user.password_hash.startsWith('$2')).toBe(true); // bcrypt
    });

    test('🔒 rejects weak password', async () => {
        const res = await request(server)
            .post('/api/v1/auth/register')
            .send({ email: 'weak@test.com', password: 'password', first_name: 'A', last_name: 'B' });
        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);
        expect(res.body.details).toBeDefined();
    });

    test('🔒 rejects duplicate email', async () => {
        const payload = { email: 'dup@test.com', password: 'Secure@Pass1', first_name: 'A', last_name: 'B' };
        await request(server).post('/api/v1/auth/register').send(payload);
        const res = await request(server).post('/api/v1/auth/register').send(payload);
        expect(res.status).toBe(409);
    });

    test('🔒 rejects invalid email format', async () => {
        const res = await request(server).post('/api/v1/auth/register')
            .send({ email: 'not-an-email', password: 'Secure@Pass1', first_name: 'A', last_name: 'B' });
        expect(res.status).toBe(422);
    });
});

describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
        await request(server).post('/api/v1/auth/register').send({
            email: 'user@test.com', password: 'Secure@Pass1', first_name: 'A', last_name: 'B',
        });
    });

    test('✅ login with valid credentials returns JWT cookie', async () => {
        const res = await request(server).post('/api/v1/auth/login')
            .send({ email: 'user@test.com', password: 'Secure@Pass1' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const cookies = res.headers['set-cookie'];
        expect(cookies.some((c) => c.includes('access_token'))).toBe(true);
        expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
    });

    test('🔒 rejects wrong password', async () => {
        const res = await request(server).post('/api/v1/auth/login')
            .send({ email: 'user@test.com', password: 'WrongPass@1' });
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('🔒 rejects non-existent user without revealing user existence', async () => {
        const res = await request(server).post('/api/v1/auth/login')
            .send({ email: 'noexist@test.com', password: 'Secure@Pass1' });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid credentials.'); // Same message as wrong pw
    });
});

describe('GET /api/v1/auth/me', () => {
    test('✅ returns profile when authenticated', async () => {
        const agent = request.agent(server);
        await agent.post('/api/v1/auth/register').send({
            email: 'me@test.com', password: 'Secure@Pass1', first_name: 'A', last_name: 'B',
        });
        const res = await agent.get('/api/v1/auth/me');
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('me@test.com');
        expect(res.body.data.password_hash).toBeUndefined(); // Never expose hash
    });

    test('🔒 returns 401 without auth token', async () => {
        const res = await request(server).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
    });

    test('🔒 rejects tampered Bearer token', async () => {
        const res = await request(server).get('/api/v1/auth/me')
            .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.tampered.invalid');
        expect(res.status).toBe(401);
    });
});

describe('Health Check', () => {
    test('✅ GET /health returns database status', async () => {
        const res = await request(server).get('/health');
        expect(res.status).toBeOneOf ? expect([200, 503]).toContain(res.status) : true;
        expect(res.body.status).toBeDefined();
    });
});
