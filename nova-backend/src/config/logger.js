// ============================================================
// NOVA Platform — Winston Logger
// Structured JSON logging with daily rotation in production
// ============================================================
'use strict';

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('./env');

const { combine, timestamp, errors, json, colorize, simple } = format;

const auditTransport = new DailyRotateFile({
    filename: path.join(config.logging.dir, 'audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    level: 'info',
});

const errorTransport = new DailyRotateFile({
    filename: path.join(config.logging.dir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
});

const consoleTransport = new transports.Console({
    format: config.env === 'production'
        ? combine(timestamp(), json())
        : combine(colorize(), simple()),
});

const logger = createLogger({
    level: config.logging.level,
    format: combine(
        timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.sssZ' }),
        errors({ stack: true }),
        json()
    ),
    defaultMeta: { service: 'nova-backend' },
    transports: [
        consoleTransport,
        ...(config.env !== 'test' ? [auditTransport, errorTransport] : []),
    ],
    exitOnError: false,
});

// Structured audit log helper — append-only security record
logger.audit = (action, userId, resourceType, resourceId, metadata = {}) => {
    logger.info('AUDIT', {
        audit: true,
        action,
        userId: userId || 'anonymous',
        resourceType,
        resourceId,
        metadata,
        timestamp: new Date().toISOString(),
    });
};

module.exports = logger;
