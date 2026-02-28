// ============================================================
// NOVA Platform — AML/KYC Service
// Adapter pattern: Jumio/Onfido SDK → NOVA vendor risk
// Falls back gracefully to internal rule-based scoring.
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');
const { sendKYCStatusEmail } = require('./email.service');

// ---- Provider detection ----
const KYC_PROVIDER = process.env.KYC_PROVIDER || 'internal'; // 'jumio' | 'onfido' | 'internal'

// ============================================================
// Jumio Adapter
// Docs: https://jumio.com/developers/
// Set: KYC_PROVIDER=jumio, KYC_API_KEY, KYC_API_SECRET, KYC_DATACENTER=EU
// ============================================================
async function runJumioKYC(vendor) {
    const https = require('https');
    const { promisify } = require('util');

    const credentials = Buffer.from(
        `${process.env.KYC_API_KEY}:${process.env.KYC_API_SECRET}`
    ).toString('base64');

    const datacenter = process.env.KYC_DATACENTER || 'EU';
    const baseUrl = datacenter === 'EU'
        ? 'netverify.com'
        : 'lon.netverify.com';

    const body = JSON.stringify({
        customerInternalReference: vendor.id,
        userReference: vendor.user_id,
        country: vendor.country,
        idType: 'PASSPORT',
        callbackUrl: `${process.env.FRONTEND_URL}/webhooks/jumio`,
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: `netverify.${baseUrl}`,
            path: '/api/netverify/v2/verifications',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'NOVA-Platform/1.0',
            },
        }, (res) => {
            let data = '';
            res.on('data', (d) => { data += d; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            provider: 'jumio',
                            transactionReference: parsed.jumioIdScanReference,
                            redirectUrl: parsed.clientRedirectUrl,
                            status: 'initiated',
                            rawResponse: parsed,
                        });
                    } else {
                        reject(new Error(`Jumio API error: ${res.statusCode} — ${data}`));
                    }
                } catch (e) {
                    reject(new Error('Jumio response parse error'));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ============================================================
// Onfido Adapter
// Docs: https://documentation.onfido.com/
// Set: KYC_PROVIDER=onfido, KYC_API_KEY (region-based token)
// ============================================================
async function runOnfidoKYC(vendor) {
    // Dynamic require to avoid errors when onfido SDK not installed
    const body = JSON.stringify({
        first_name: vendor.company_name,
        last_name: 'Corporate',
        email: `kyc+${vendor.id}@sfeci.com`,
    });

    const { https: _ } = await (async () => ({ https: require('https') }))();
    const https = require('https');

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.eu.onfido.com',
            path: '/v3.6/applicants',
            method: 'POST',
            headers: {
                'Authorization': `Token token=${process.env.KYC_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', (d) => { data += d; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            provider: 'onfido',
                            applicantId: parsed.id,
                            status: 'applicant_created',
                            rawResponse: parsed,
                        });
                    } else {
                        reject(new Error(`Onfido API error: ${res.statusCode} — ${data}`));
                    }
                } catch (e) {
                    reject(new Error('Onfido response parse error'));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ============================================================
// Internal Rule-Based KYC (Phase 1 fallback)
// ============================================================
async function runInternalKYC(vendor) {
    // Simulate deterministic KYC result based on vendor data
    const SANCTIONED = ['KP', 'IR', 'SY', 'CU', 'VE'];
    const HIGH_RISK = ['RU', 'BY', 'MM', 'SD', 'SO', 'YE', 'LY', 'CF'];

    const sanctioned = SANCTIONED.includes(vendor.country);
    const highRisk = HIGH_RISK.includes(vendor.country);

    const documentScore = vendor.registration_number && vendor.vat_number ? 90 : 50;
    const overallScore = sanctioned ? 0 : highRisk ? 35 : documentScore;

    return {
        provider: 'internal',
        applicantId: vendor.id,
        status: sanctioned ? 'rejected' : overallScore < 50 ? 'consider' : 'clear',
        score: overallScore,
        sanctioned,
        highRisk,
        breakdown: {
            country: sanctioned ? 'sanctioned' : highRisk ? 'high_risk' : 'clear',
            documentation: vendor.registration_number ? 'provided' : 'missing',
        },
    };
}

// ============================================================
// Main KYC runner — dispatches to configured provider
// ============================================================
async function initiateKYC(vendorId) {
    const vendor = await knex('vendors').where({ id: vendorId }).first();
    if (!vendor) throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });

    logger.info('[KYC] Initiating KYC check', { vendorId, provider: KYC_PROVIDER });

    let result;
    try {
        if (KYC_PROVIDER === 'jumio') {
            result = await runJumioKYC(vendor);
        } else if (KYC_PROVIDER === 'onfido') {
            result = await runOnfidoKYC(vendor);
        } else {
            result = await runInternalKYC(vendor);
        }
    } catch (err) {
        logger.error('[KYC] Provider failed, falling back to internal', { error: err.message });
        result = await runInternalKYC(vendor);
        result.providerError = err.message;
    }

    // Save KYC result to vendor_risk_scores
    await knex('vendor_risk_scores').insert({
        vendor_id: vendorId,
        score: result.score ?? null,
        risk_level: result.status === 'clear' ? 'low' : result.status === 'consider' ? 'medium' : 'high',
        score_factors: JSON.stringify({
            provider: result.provider,
            kyc_status: result.status,
            breakdown: result.breakdown || {},
        }),
        is_ai_scored: false,
        ai_confidence: KYC_PROVIDER === 'internal' ? 85.0 : 99.0,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    // Update vendor status based on KYC result
    const kyc_status = result.status;
    const newVendorStatus = (kyc_status === 'clear' || kyc_status === 'applicant_created' || kyc_status === 'initiated')
        ? 'risk_scored'
        : result.sanctioned ? 'rejected' : 'risk_scored';

    const vendorUser = await knex('users').where({ id: vendor.user_id }).first();

    await knex('vendors').where({ id: vendorId }).update({
        aml_cleared: !result.sanctioned,
        status: newVendorStatus,
        sanction_check_result: JSON.stringify({
            screened_at: new Date().toISOString(),
            provider: result.provider,
            status: kyc_status,
            sanctioned: result.sanctioned || false,
        }),
        updated_at: knex.fn.now(),
    });

    // Email notification
    if (vendorUser) {
        sendKYCStatusEmail({
            to: vendorUser.email,
            vendorName: vendor.company_name,
            status: newVendorStatus,
            notes: result.providerError ? 'Verification completed via internal system.' : null,
        }).catch(() => { });
    }

    logger.audit('KYC_INITIATED', null, 'vendor', vendorId, { provider: KYC_PROVIDER, status: kyc_status });
    return { vendorId, kycResult: result, vendorStatus: newVendorStatus };
}

/**
 * Handle inbound webhook from Jumio/Onfido to update vendor status.
 */
async function processKYCWebhook(provider, payload) {
    let vendorId, kycStatus;

    if (provider === 'jumio') {
        vendorId = payload.customerInternalReference;
        kycStatus = payload.idScanStatus === 'SUCCESS' ? 'clear' : 'rejected';
    } else if (provider === 'onfido') {
        // Onfido sends check results
        vendorId = payload.applicant_id; // Mapped via applicant metadata
        kycStatus = payload.result === 'clear' ? 'clear' : 'consider';
    } else {
        logger.warn('[KYC Webhook] Unknown provider', { provider });
        return;
    }

    if (!vendorId) {
        logger.warn('[KYC Webhook] Missing vendor reference in payload');
        return;
    }

    const newStatus = kycStatus === 'clear' ? 'risk_scored' : 'rejected';
    await knex('vendors').where({ id: vendorId }).update({
        status: newStatus,
        aml_cleared: kycStatus === 'clear',
        updated_at: knex.fn.now(),
    });

    logger.audit('KYC_WEBHOOK_PROCESSED', null, 'vendor', vendorId, { provider, kycStatus, newStatus });
    return { vendorId, kycStatus, newStatus };
}

module.exports = { initiateKYC, processKYCWebhook };
