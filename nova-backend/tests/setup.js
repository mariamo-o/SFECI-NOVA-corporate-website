// ============================================================
// NOVA Platform — Jest Test Setup
// Runs after the test framework is installed in the environment.
// Sets NODE_ENV, silences Winston loggers during tests, and
// sets a longer timeout for async DB operations.
// ============================================================
'use strict';

// Force test environment so knexfile picks the right DB config
process.env.NODE_ENV = 'test';

// Silence Winston transport output during test runs (errors still visible)
process.env.LOG_LEVEL = 'error';

// Increase Jest's default timeout for tests involving real DB queries
jest.setTimeout(30000);

// Suppress console.log in tests (keep console.error)
global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
};
