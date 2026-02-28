// ============================================================
// NOVA Platform — Environment Configuration Validator
// Fails fast on startup if required vars are missing.
// ============================================================
'use strict';

require('dotenv').config();

const required = [
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
    'COOKIE_SECRET',
];

const missing = required.filter((key) => !process.env[key] || process.env[key].includes('changeme'));

if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`[FATAL] Missing or default environment variables for production: ${missing.join(', ')}`);
    process.exit(1);
}

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn(`[WARN] Using default/placeholder values for: ${missing.join(', ')} — OK for development only`);
}

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3001,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    apiVersion: process.env.API_VERSION || 'v1',

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        name: process.env.DB_NAME || 'nova_db',
        user: process.env.DB_USER || 'nova_user',
        password: process.env.DB_PASSWORD || 'dev_password',
        poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 2,
        poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    },

    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_min_32_chars_xxxx',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_min_32_chars_xxx',
        accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
        refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    },

    cookie: {
        secret: process.env.COOKIE_SECRET || 'dev_cookie_secret_min_32_chars_xxx',
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: process.env.COOKIE_SAME_SITE || 'lax',
        httpOnly: true,
    },

    csrf: {
        secret: process.env.CSRF_SECRET || 'dev_csrf_secret_min_32_chars_xxxxx',
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
        maxAuth: parseInt(process.env.RATE_LIMIT_MAX_AUTH, 10) || 20,
        maxApi: parseInt(process.env.RATE_LIMIT_MAX_API, 10) || 500,
    },

    upload: {
        maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 10,
        allowedTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'pdf,doc,docx,xls,xlsx,jpg,jpeg,png').split(','),
        dir: process.env.UPLOAD_DIR || './uploads',
    },

    email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.EMAIL_FROM || 'NOVA Platform <noreply@sfeci.com>',
    },

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        currency: process.env.STRIPE_CURRENCY || 'eur',
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs',
    },

    security: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    },

    totp: {
        issuer: process.env.TOTP_ISSUER || 'NOVA Platform',
        algorithm: process.env.TOTP_ALGORITHM || 'SHA1',
        digits: parseInt(process.env.TOTP_DIGITS, 10) || 6,
        period: parseInt(process.env.TOTP_PERIOD, 10) || 30,
    },

    governance: {
        vendorRiskHighThreshold: parseInt(process.env.VENDOR_RISK_HIGH_THRESHOLD, 10) || 70,
        vendorRiskMediumThreshold: parseInt(process.env.VENDOR_RISK_MEDIUM_THRESHOLD, 10) || 40,
        rfqSlaHours: parseInt(process.env.RFQ_SLA_HOURS, 10) || 48,
        disputeSlaHours: parseInt(process.env.DISPUTE_SLA_HOURS, 10) || 72,
    },
};

module.exports = config;
