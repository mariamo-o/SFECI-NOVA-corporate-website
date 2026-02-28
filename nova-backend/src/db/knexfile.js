// ============================================================
// NOVA Platform — Knex Configuration for CLI usage
// (Used by: knex migrate:latest, knex seed:run)
// ============================================================
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Resolve migration/seed directories relative to THIS file's location
// so paths are correct regardless of the calling process's CWD.
const migrationsDir = path.join(__dirname, 'migrations');
const seedsDir = path.join(__dirname, 'seeds');

module.exports = {
    development: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT, 10) || 5432,
            database: process.env.DB_NAME || 'nova_db',
            user: process.env.DB_USER || 'nova_user',
            password: process.env.DB_PASSWORD || 'dev_password',
        },
        pool: { min: 2, max: 10 },
        migrations: { directory: migrationsDir, tableName: 'knex_migrations' },
        seeds: { directory: seedsDir },
    },

    test: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT, 10) || 5432,
            database: process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'nova_db_test',
            user: process.env.DB_USER || 'nova_user',
            password: process.env.DB_PASSWORD || 'dev_password',
        },
        pool: { min: 2, max: 10 },
        migrations: { directory: migrationsDir, tableName: 'knex_migrations' },
        seeds: { directory: seedsDir },
    },

    production: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT, 10),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: true },
        },
        pool: { min: 2, max: 20 },
        migrations: { directory: migrationsDir, tableName: 'knex_migrations' },
        seeds: { directory: seedsDir },
    },
};
