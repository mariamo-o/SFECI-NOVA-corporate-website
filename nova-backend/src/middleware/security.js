// ============================================================
// NOVA Platform — Security Middleware Stack
// OWASP Top 10 mitigations, rate limiting, CSRF, sanitization
// ALL enforcement happens server-side — client-side is UX only
// ============================================================
'use strict';

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult, matchedData } = require('express-validator');
const config = require('../config/env');
const logger = require('../config/logger');

// ---- 1. Helmet — Secure HTTP Headers ----
const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: config.env === 'production' ? [] : null,
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ---- 2. Rate Limiter — Auth routes (strict) ----
const authRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxAuth,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded on auth endpoint', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent'),
        });
        res.status(429).json({
            success: false,
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
        });
    },
    skip: (req) => config.env === 'test',
});

// ---- 3. Rate Limiter — General API ----
const apiRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxApi,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('API rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(429).json({
            success: false,
            error: 'API rate limit exceeded. Please slow down.',
        });
    },
    skip: (req) => config.env === 'test',
});

// ---- 4. Input Sanitization Middleware ----
// Strips dangerous patterns from request body/query/params
const sanitizeRequest = (req, res, next) => {
    const dangerousPatterns = [
        /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
        /javascript\s*:/gi,
        /on\w+\s*=/gi,           // onload=, onclick=, etc.
        /data\s*:\s*text\/html/gi,
        /(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+set|exec\s*\(|xp_cmdshell)/gi,
        /--\s|\/\*[\s\S]*?\*\//g, // SQL comments
    ];

    const sanitizeValue = (value) => {
        if (typeof value !== 'string') return value;
        let cleaned = value;
        let flagged = false;
        for (const pattern of dangerousPatterns) {
            if (pattern.test(cleaned)) {
                flagged = true;
                cleaned = cleaned.replace(pattern, '');
            }
            pattern.lastIndex = 0; // reset regex state
        }
        if (flagged) {
            logger.warn('Malicious input pattern detected and stripped', {
                ip: req.ip,
                original: value.substring(0, 100),
                path: req.path,
            });
        }
        return cleaned;
    };

    const sanitizeObject = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const result = {};
        for (const [key, val] of Object.entries(obj)) {
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                result[key] = sanitizeObject(val);
            } else if (Array.isArray(val)) {
                result[key] = val.map((v) => (typeof v === 'string' ? sanitizeValue(v) : v));
            } else {
                result[key] = sanitizeValue(val);
            }
        }
        return result;
    };

    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    next();
};

// ---- 5. Validation Error Handler ----
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.info('Validation failed', { errors: errors.array(), path: req.path, ip: req.ip });
        return res.status(422).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

// ---- 6. Request Logger (Security Audit) ----
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
        logger[level] ? logger[level](`${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id,
        }) : null;
    });
    next();
};

// ---- 7. CSRF Token Generation (Stateless, double-submit cookie pattern) ----
// Since we're using HTTPOnly JWTs, we implement double-submit cookie CSRF protection
const { randomBytes } = require('crypto');

const csrfProtect = (req, res, next) => {
    // Skip for GET, HEAD, OPTIONS (safe methods)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    // Skip in test environment
    if (config.env === 'test') return next();

    const tokenFromCookie = req.cookies['csrf-token'];
    const tokenFromHeader = req.headers['x-csrf-token'];

    if (!tokenFromCookie || !tokenFromHeader || tokenFromCookie !== tokenFromHeader) {
        logger.warn('CSRF token mismatch', { ip: req.ip, path: req.path });
        return res.status(403).json({
            success: false,
            error: 'CSRF token validation failed. Please refresh and try again.',
        });
    }
    next();
};

const generateCsrfToken = (req, res) => {
    const token = randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, {
        httpOnly: false, // Must be readable by JS for double-submit pattern
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        maxAge: 24 * 60 * 60 * 1000, // 24h
    });
    res.json({ csrfToken: token });
};

module.exports = {
    helmetMiddleware,
    authRateLimiter,
    apiRateLimiter,
    sanitizeRequest,
    handleValidationErrors,
    requestLogger,
    csrfProtect,
    generateCsrfToken,
    body,
    matchedData,
};
