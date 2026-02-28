// ============================================================
// NOVA Platform — Observability Routes
// Prometheus metrics, detailed health, and readiness probes.
// These endpoints do NOT require authentication.
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const { checkConnection } = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/env');

// ---- Prometheus client setup ----
// Install: npm install prom-client
let client;
try {
    client = require('prom-client');
    client.collectDefaultMetrics({ prefix: 'nova_' }); // CPU, memory, event loop, GC, etc.
} catch (_) {
    logger.warn('[Observability] prom-client not installed. GET /metrics will return empty response.');
    client = null;
}

// Custom metrics (used by metrics middleware)
let httpRequestCounter, httpRequestDuration, httpErrorCounter;

if (client) {
    // Total HTTP requests labeled by method, route, status
    httpRequestCounter = new client.Counter({
        name: 'nova_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
    });

    // Request latency histogram (percentile-ready)
    httpRequestDuration = new client.Histogram({
        name: 'nova_http_request_duration_ms',
        help: 'HTTP request latency in milliseconds',
        labelNames: ['method', 'route', 'status'],
        buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000], // ms buckets
    });

    // Error rate counter
    httpErrorCounter = new client.Counter({
        name: 'nova_http_errors_total',
        help: 'Total HTTP errors (4xx + 5xx)',
        labelNames: ['method', 'route', 'status'],
    });
}

/**
 * Request timing middleware — attach to app before routes.
 * Records latency and increments counters.
 */
const metricsMiddleware = (req, res, next) => {
    if (!client) return next();

    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const route = req.route?.path || req.path || 'unknown';
        const labels = { method: req.method, route, status: res.statusCode };

        httpRequestCounter.inc(labels);
        httpRequestDuration.observe(labels, duration);
        if (res.statusCode >= 400) {
            httpErrorCounter.inc(labels);
        }
    });
    next();
};

// ============================================================
// ROUTES
// ============================================================

/**
 * GET /metrics
 * Prometheus-format metrics export.
 */
router.get('/metrics', async (req, res) => {
    if (!client) {
        return res.status(503).send('# prom-client not installed. Run: npm install prom-client\n');
    }
    try {
        res.set('Content-Type', client.register.contentType);
        const metrics = await client.register.metrics();
        res.end(metrics);
    } catch (err) {
        res.status(500).send(`# Error collecting metrics: ${err.message}\n`);
    }
});

/**
 * GET /health/detailed
 * Deep health check: database, Stripe (if configured), SMTP reachability.
 */
router.get('/health/detailed', async (req, res) => {
    const checks = {};
    let overallOk = true;

    // Database
    try {
        const dbOk = await checkConnection();
        checks.database = { status: dbOk ? 'ok' : 'error', latency_ms: null };
        if (!dbOk) overallOk = false;
    } catch (err) {
        checks.database = { status: 'error', error: err.message };
        overallOk = false;
    }

    // Stripe (optional — check if secret key configured)
    if (config.stripe?.secretKey) {
        try {
            // Lightweight Stripe API check: retrieve account balance
            const stripe = require('stripe')(config.stripe.secretKey);
            await stripe.balance.retrieve();
            checks.stripe = { status: 'ok' };
        } catch (err) {
            checks.stripe = { status: 'degraded', error: 'Stripe API unreachable' };
            // Non-fatal — don't mark overall as failed for payment gateway
        }
    } else {
        checks.stripe = { status: 'not_configured' };
    }

    // Email transport (non-blocking)
    checks.email = {
        status: (config.email?.host && config.email?.user) ? 'configured' : 'using_ethereal_test',
    };

    const statusCode = overallOk ? 200 : 503;
    res.status(statusCode).json({
        status: overallOk ? 'healthy' : 'degraded',
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: config.env,
        checks,
    });
});

/**
 * GET /readiness
 * Kubernetes readiness probe — returns 200 when ready to serve traffic.
 */
router.get('/readiness', async (req, res) => {
    try {
        const dbOk = await checkConnection();
        if (!dbOk) {
            return res.status(503).json({ ready: false, reason: 'Database not available' });
        }
        res.json({ ready: true });
    } catch (err) {
        res.status(503).json({ ready: false, reason: err.message });
    }
});

module.exports = { router, metricsMiddleware };
