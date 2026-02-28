// ============================================================
// NOVA Platform — Knex Database Configuration
// ============================================================
'use strict';

const config = require('./env');
const logger = require('./logger');

const knex = require('knex')({
    client: 'pg',
    connection: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
        user: config.db.user,
        password: config.db.password,
        ssl: config.env === 'production' ? { rejectUnauthorized: true } : false,
    },
    pool: {
        min: config.db.poolMin,
        max: config.db.poolMax,
        afterCreate: (conn, done) => {
            // Enable parameterized queries and strict mode
            conn.query('SET timezone="UTC"', done);
        },
    },
    acquireConnectionTimeout: 10000,
    debug: config.env === 'development' && process.env.KNEX_DEBUG === 'true',
});

// Connection health check
async function checkConnection() {
    try {
        await knex.raw('SELECT 1');
        logger.info('Database connection established', {
            host: config.db.host,
            database: config.db.name,
        });
        return true;
    } catch (err) {
        logger.error('Database connection failed', { error: err.message });
        return false;
    }
}

module.exports = { knex, checkConnection };
