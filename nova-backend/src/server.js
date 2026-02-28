// ============================================================
// NOVA Platform — Main Server Entry Point
// ============================================================
'use strict';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const cron = require('node-cron');

const config = require('./config/env');
const logger = require('./config/logger');
const { checkConnection } = require('./config/database');
const { helmetMiddleware, apiRateLimiter, requestLogger } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { RFQStateMachine } = require('./services/rfqStateMachine');
const { DisputeStateMachineService } = require('./services/disputeStateMachine');
const { processKYCWebhook } = require('./services/amlKyc.service');
const { detectOverdue: detectOverdueInvoices } = require('./services/invoice.service');
const { processEscalations: processAIEscalations } = require('./services/aiGovernance.service');
const { multiTenantMiddleware } = require('./middleware/multiTenant');

// Route imports
const authRoutes = require('./routes/auth.routes');
const vendorRoutes = require('./routes/vendor.routes');
const rfqRoutes = require('./routes/rfq.routes');
const tradeRoutes = require('./routes/trade.routes');
const disputeRoutes = require('./routes/dispute.routes');
const productRoutes = require('./routes/product.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiGovernanceRoutes = require('./routes/aiGovernance.routes');
const { router: observabilityRouter, metricsMiddleware } = require('./routes/observability.routes');

const app = express();

// ---- Trust proxy (for correct IP behind nginx) ----
app.set('trust proxy', 1);

// ---- Multi-tenancy resolution (before all routes) ----
app.use(multiTenantMiddleware);

// ---- Prometheus metrics recording (before routes) ----
app.use(metricsMiddleware);

// ---- Security headers ----
app.use(helmetMiddleware);

// ---- CORS (only allow configured frontend origin) ----
app.use(cors({
    origin: [config.frontendUrl, 'http://localhost:3000', 'http://localhost:3001', 'file://'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// ---- Body parsing ----
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(config.cookie.secret));

// ---- Compression ----
app.use(compression());

// ---- HTTP request logging (development) ----
if (config.env !== 'test') {
    app.use(morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
    }));
}

// ---- Rate limiting ----
app.use(`/api/${config.apiVersion}`, apiRateLimiter);

// ---- Audit request logging ----
app.use(requestLogger);

// ---- Health check (no auth required) ----
app.get('/health', async (req, res) => {
    const dbOk = await checkConnection().catch(() => false);
    const status = dbOk ? 'ok' : 'degraded';
    res.status(dbOk ? 200 : 503).json({
        status,
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        services: { database: dbOk ? 'connected' : 'disconnected' },
    });
});

// ---- API routes ----
const apiBase = `/api/${config.apiVersion}`;
app.use(`${apiBase}/auth`, authRoutes);
app.use(`${apiBase}/vendors`, vendorRoutes);
app.use(`${apiBase}/rfqs`, rfqRoutes);
app.use(`${apiBase}/trade`, tradeRoutes);
app.use(`${apiBase}/trade/disputes`, disputeRoutes);
app.use(`${apiBase}/products`, productRoutes);
app.use(`${apiBase}/invoices`, invoiceRoutes);
app.use(`${apiBase}/analytics`, analyticsRoutes);
app.use(`${apiBase}/ai`, aiGovernanceRoutes);

// ---- Observability (no auth) ----
app.use(observabilityRouter);

// ---- KYC Webhook (Jumio / Onfido callbacks) ----
app.post('/webhooks/:provider', express.json(), async (req, res) => {
    try {
        const result = await processKYCWebhook(req.params.provider, req.body);
        res.json({ received: true, result });
    } catch (err) {
        logger.error('KYC webhook error', { error: err.message });
        res.status(500).json({ received: false });
    }
});

// ---- Swagger API docs (disabled in production by default) ----
if (config.env !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const swaggerUi = require('swagger-ui-express');
    const swaggerSpec = require('./config/swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { background: linear-gradient(135deg,#0a1628,#1a3a6b); }',
        customSiteTitle: 'NOVA Platform API Docs',
    }));
    app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
    logger.info('Swagger UI available at /api-docs');
}

// ---- Static uploads (served securely with auth check in production) ----
app.use('/uploads', express.static(config.upload.dir));

// ---- 404 handler ----
app.use(notFoundHandler);

// ---- Global error handler ----
app.use(errorHandler);

// ============================================================
// CRON Jobs
// ============================================================
if (config.env !== 'test') {
    // Every hour: check SLA breaches and expire stale RFQs
    cron.schedule('0 * * * *', async () => {
        try {
            const result = await RFQStateMachine.processExpiredRFQs();
            if (result.breached > 0 || result.expired > 0) {
                logger.info('RFQ cron completed', result);
            }
        } catch (err) {
            logger.error('RFQ cron failed', { error: err.message });
        }
    });

    // Every 30 minutes: auto-escalate overdue disputes
    cron.schedule('*/30 * * * *', async () => {
        try {
            const result = await DisputeStateMachineService.processOverdueDisputes();
            if (result.escalated > 0) {
                logger.info('Dispute SLA cron: escalated overdue disputes', result);
            }
        } catch (err) {
            logger.error('Dispute cron failed', { error: err.message });
        }
    });

    // Daily at midnight: detect overdue invoices
    cron.schedule('0 0 * * *', async () => {
        try {
            const result = await detectOverdueInvoices();
            if (result.marked > 0) {
                logger.info('Invoice overdue cron completed', result);
            }
        } catch (err) {
            logger.error('Invoice overdue cron failed', { error: err.message });
        }
    });

    // Every 30 minutes: flag AI governance SLA breaches
    cron.schedule('*/30 * * * *', async () => {
        try {
            const result = await processAIEscalations();
            if (result.flagged > 0) {
                logger.warn('AI governance SLA breaches flagged', result);
            }
        } catch (err) {
            logger.error('AI escalation cron failed', { error: err.message });
        }
    });
}

// ============================================================
// Server Start
// ============================================================
async function start() {
    // Verify DB connection before accepting traffic
    const dbReady = await checkConnection();
    if (!dbReady && config.env === 'production') {
        logger.error('Cannot start: database not available');
        process.exit(1);
    }

    const server = app.listen(config.port, () => {
        logger.info(`NOVA Backend started`, {
            env: config.env,
            port: config.port,
            apiBase: `/api/${config.apiVersion}`,
        });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
        logger.info(`${signal} received — shutting down gracefully`);
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });
        setTimeout(() => {
            logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled promise rejection', { reason });
    });

    return server;
}

if (require.main === module) {
    start();
}

module.exports = { app, start };
