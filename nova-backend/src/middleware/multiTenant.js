// ============================================================
// NOVA Platform — Multi-Tenant Middleware
// Resolves tenant from X-Tenant-ID header or subdomain.
// Attaches req.tenant to all requests.
// All service-layer queries should be scoped by tenant_id.
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');

/**
 * Resolve tenant from X-Tenant-ID header, Host subdomain, or fall back to default.
 * Attaches req.tenant to request. Rejects unknown/inactive tenants with 401.
 *
 * Usage: register BEFORE all routes in server.js
 *   app.use(multiTenantMiddleware);
 *
 * All service-layer queries should be extended with:
 *   .where({ tenant_id: req.tenant.id })
 */
const multiTenantMiddleware = async (req, res, next) => {
    try {
        // Skip for system endpoints that don't need tenant context
        const skipPaths = ['/health', '/metrics', '/readiness', '/webhooks'];
        if (skipPaths.some((p) => req.path.startsWith(p))) {
            req.tenant = null;
            return next();
        }

        let tenant = null;

        // 1. Explicit header (API clients, Postman, integrations)
        const tenantIdHeader = req.headers['x-tenant-id'];
        if (tenantIdHeader) {
            tenant = await knex('tenants').where({ id: tenantIdHeader, is_active: true }).first();
            if (!tenant) {
                return res.status(401).json({ success: false, error: 'Invalid or inactive tenant ID.' });
            }
        }

        // 2. Subdomain resolution (e.g. sfeci.nova-platform.com → subdomain: 'sfeci')
        if (!tenant) {
            const host = req.headers.host || '';
            const subdomain = host.split('.')[0];
            if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
                tenant = await knex('tenants').where({ subdomain, is_active: true }).first();
            }
        }

        // 3. Default to platform default tenant
        if (!tenant) {
            tenant = await knex('tenants')
                .where({ id: '00000000-0000-0000-0000-000000000001', is_active: true })
                .first();
        }

        if (!tenant) {
            logger.warn('[MultiTenant] No valid tenant resolved', { host: req.headers.host });
            return res.status(401).json({ success: false, error: 'Tenant could not be resolved.' });
        }

        req.tenant = tenant;
        next();
    } catch (err) {
        logger.error('[MultiTenant] Middleware error', { error: err.message });
        next(err);
    }
};

module.exports = { multiTenantMiddleware };
