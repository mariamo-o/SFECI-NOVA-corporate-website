// ============================================================
// NOVA Platform — Global Error Handler
// ============================================================
'use strict';

const logger = require('../config/logger');
const config = require('../config/env');

// Convert known error types to structured responses
const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';

    // Knex / PostgreSQL errors
    if (err.code === '23505') { statusCode = 409; message = 'A record with this value already exists.'; }
    if (err.code === '23503') { statusCode = 400; message = 'Referenced resource does not exist.'; }
    if (err.code === '23502') { statusCode = 400; message = 'Required field is missing.'; }
    if (err.code === '22P02') { statusCode = 400; message = 'Invalid data type provided.'; }
    if (err.code === 'ECONNREFUSED') { statusCode = 503; message = 'Database unavailable.'; }

    // JWT errors
    if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token.'; }
    if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired.'; }

    // Multer errors
    if (err.code === 'LIMIT_FILE_SIZE') { statusCode = 413; message = 'File exceeds maximum size limit.'; }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') { statusCode = 400; message = 'Unexpected file field.'; }

    // Log all server errors
    if (statusCode >= 500) {
        logger.error('Unhandled server error', {
            error: err.message,
            stack: config.env !== 'production' ? err.stack : undefined,
            path: req.path,
            method: req.method,
            userId: req.user?.id,
            ip: req.ip,
        });
    }

    // Never expose stack traces or internal details in production
    const response = {
        success: false,
        error: message,
        ...(config.env !== 'production' && statusCode >= 500 && { stack: err.stack }),
    };

    res.status(statusCode).json(response);
};

// 404 handler (must be registered after all routes)
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
};

// Async error wrapper — eliminates try/catch boilerplate in route handlers
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, notFoundHandler, asyncHandler };
