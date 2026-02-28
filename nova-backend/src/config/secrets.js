// ============================================================
// NOVA Platform — Secrets Manager
// Loads secrets from HashiCorp Vault when configured,
// falls back to process.env (for dev / non-Vault setups).
// ============================================================
'use strict';

const logger = require('./logger');

const VAULT_ADDR = process.env.VAULT_ADDR;
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_PATH = process.env.VAULT_SECRET_PATH || 'secret/data/nova';
const VAULT_TIMEOUT = 5000;

let secretsCache = null;
let cacheExpiry = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Fetch secrets from HashiCorp Vault KV v2.
 * Falls back silently to environment variables.
 */
async function fetchFromVault() {
    if (!VAULT_ADDR || !VAULT_TOKEN) return null;

    const http = VAULT_ADDR.startsWith('https') ? require('https') : require('http');
    const url = new URL(`${VAULT_ADDR}/v1/${VAULT_PATH}`);

    return new Promise((resolve) => {
        const req = http.request(
            {
                hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET',
                headers: { 'X-Vault-Token': VAULT_TOKEN, 'Content-Type': 'application/json' },
                timeout: VAULT_TIMEOUT,
            },
            (res) => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        // KV v2 stores in data.data
                        resolve(parsed?.data?.data || null);
                    } catch {
                        resolve(null);
                    }
                });
            }
        );
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
}

/**
 * Get a secret value: Vault first, then env, then default.
 */
async function getSecret(key, defaultValue = undefined) {
    const now = Date.now();

    // Refresh cache if expired
    if (!secretsCache || now > cacheExpiry) {
        const vaultSecrets = await fetchFromVault();
        if (vaultSecrets) {
            secretsCache = vaultSecrets;
            cacheExpiry = now + CACHE_TTL;
            logger.info('[Secrets] Loaded from Vault', { path: VAULT_PATH });
        } else {
            if (VAULT_ADDR && VAULT_TOKEN) {
                logger.warn('[Secrets] Vault unreachable — falling back to environment variables');
            }
            secretsCache = {}; // Use env only
            cacheExpiry = now + CACHE_TTL;
        }
    }

    return secretsCache[key] ?? process.env[key] ?? defaultValue;
}

/**
 * Preload all secrets at startup (called once from server.js).
 * Returns a flat config object with all resolved secrets.
 */
async function loadSecrets() {
    const vaultSecrets = await fetchFromVault();
    if (vaultSecrets) {
        secretsCache = vaultSecrets;
        cacheExpiry = Date.now() + CACHE_TTL;
        logger.info('[Secrets] All secrets loaded from Vault on startup');
    }

    return {
        jwtAccessSecret: await getSecret('JWT_ACCESS_SECRET'),
        jwtRefreshSecret: await getSecret('JWT_REFRESH_SECRET'),
        cookieSecret: await getSecret('COOKIE_SECRET'),
        csrfSecret: await getSecret('CSRF_SECRET'),
        dbPassword: await getSecret('DB_PASSWORD'),
        stripeSecretKey: await getSecret('STRIPE_SECRET_KEY'),
        smtpPass: await getSecret('SMTP_PASS'),
    };
}

module.exports = { getSecret, loadSecrets };
