// ============================================================
// NOVA Platform — Vendor Risk & KYC Service
// AML screening simulation, risk scoring with factor breakdown
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');
const config = require('../config/env');

// Sanctions list simulation (in production: connect to real screening API e.g. Refinitiv WorldCheck)
const SANCTIONED_COUNTRIES = ['KP', 'IR', 'SY', 'CU', 'VE'];
const HIGH_RISK_COUNTRIES = ['RU', 'BY', 'MM', 'SD', 'SO', 'YE', 'LY', 'CF'];

/**
 * Calculate risk score for a vendor.
 * Returns: { score: 0-100, riskLevel, factors }
 * Lower score = lower risk.
 */
async function calculateVendorRisk(vendorId) {
    const vendor = await knex('vendors').where({ id: vendorId }).first();
    if (!vendor) throw new Error('Vendor not found');

    const factors = {};
    let totalScore = 0;
    let maxScore = 0;

    // --- Factor 1: Country risk (30 points max) ---
    const countryWeight = 30;
    maxScore += countryWeight;
    if (SANCTIONED_COUNTRIES.includes(vendor.country)) {
        factors.country = { score: countryWeight, level: 'critical', note: 'Sanctioned country' };
        totalScore += countryWeight;
    } else if (HIGH_RISK_COUNTRIES.includes(vendor.country)) {
        const f = Math.round(countryWeight * 0.7);
        factors.country = { score: f, level: 'high', note: 'High-risk jurisdiction' };
        totalScore += f;
    } else {
        factors.country = { score: 0, level: 'low', note: 'Standard jurisdiction' };
    }

    // --- Factor 2: Document completeness (20 points max) ---
    const docWeight = 20;
    maxScore += docWeight;
    const docs = await knex('vendor_documents').where({ vendor_id: vendorId, is_verified: true });
    const requiredDocs = ['registration', 'vat', 'director_id'];
    const docTypes = docs.map((d) => d.document_type);
    const missingDocs = requiredDocs.filter((r) => !docTypes.includes(r));
    const docRisk = Math.round((missingDocs.length / requiredDocs.length) * docWeight);
    factors.documentation = {
        score: docRisk,
        level: docRisk > docWeight * 0.6 ? 'high' : docRisk > 0 ? 'medium' : 'low',
        note: missingDocs.length > 0 ? `Missing: ${missingDocs.join(', ')}` : 'All required docs present',
    };
    totalScore += docRisk;

    // --- Factor 3: Business registration (15 points max) ---
    const regWeight = 15;
    maxScore += regWeight;
    if (!vendor.registration_number && !vendor.vat_number) {
        factors.registration = { score: regWeight, level: 'high', note: 'No registration or VAT number' };
        totalScore += regWeight;
    } else if (!vendor.registration_number || !vendor.vat_number) {
        const f = Math.round(regWeight * 0.5);
        factors.registration = { score: f, level: 'medium', note: 'Partial registration data' };
        totalScore += f;
    } else {
        factors.registration = { score: 0, level: 'low', note: 'Registration verified' };
    }

    // --- Factor 4: Incorporation type / sector risk (15 points max) ---
    const sectorWeight = 15;
    maxScore += sectorWeight;
    const highRiskSectors = ['arms', 'nuclear', 'tobacco'];
    const sectors = vendor.sectors || [];
    const hasHighRiskSector = sectors.some((s) => highRiskSectors.includes(s));
    if (hasHighRiskSector) {
        factors.sector = { score: sectorWeight, level: 'high', note: 'High-risk sector involvement' };
        totalScore += sectorWeight;
    } else {
        factors.sector = { score: 0, level: 'low', note: 'Standard sectors' };
    }

    // --- Factor 5: Website & contact presence (10 points max) ---
    const webWeight = 10;
    maxScore += webWeight;
    if (!vendor.website) {
        const f = Math.round(webWeight * 0.7);
        factors.digital_presence = { score: f, level: 'medium', note: 'No website provided' };
        totalScore += f;
    } else {
        factors.digital_presence = { score: 0, level: 'low', note: 'Website present' };
    }

    // --- Factor 6: Address completeness (10 points max) ---
    const addrWeight = 10;
    maxScore += addrWeight;
    if (!vendor.address || !vendor.city || !vendor.postal_code) {
        const f = Math.round(addrWeight * 0.6);
        factors.address = { score: f, level: 'medium', note: 'Incomplete address' };
        totalScore += f;
    } else {
        factors.address = { score: 0, level: 'low', note: 'Full address provided' };
    }

    // Normalize to 0-100
    const normalizedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    const riskLevel = normalizedScore >= config.governance.vendorRiskHighThreshold ? 'high'
        : normalizedScore >= config.governance.vendorRiskMediumThreshold ? 'medium'
            : 'low';

    // Determine if sanctioned
    const isSanctioned = SANCTIONED_COUNTRIES.includes(vendor.country);

    const confidence = 78.5; // Rule-based confidence; replace with ML model in Phase 4

    // Record the score
    await knex('vendor_risk_scores').insert({
        vendor_id: vendorId,
        score: normalizedScore,
        risk_level: riskLevel,
        score_factors: JSON.stringify(factors),
        is_ai_scored: true,
        ai_confidence: confidence,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    // Update vendor record
    await knex('vendors').where({ id: vendorId }).update({
        risk_score: normalizedScore,
        risk_level: riskLevel,
        aml_cleared: !isSanctioned,
        sanction_check_result: JSON.stringify({
            screened_at: new Date().toISOString(),
            is_sanctioned: isSanctioned,
            country_check: vendor.country,
        }),
        status: isSanctioned ? 'rejected' : 'risk_scored',
        updated_at: knex.fn.now(),
    });

    logger.audit('VENDOR_RISK_SCORED', null, 'vendor', vendorId, {
        score: normalizedScore,
        riskLevel,
        isSanctioned,
        confidence,
    });

    return { score: normalizedScore, riskLevel, factors, isSanctioned, confidence };
}

/**
 * Advance vendor to board_review if risk scored and not sanctioned.
 */
async function advanceToBoard(vendorId, complianceOfficerId, notes = '') {
    const vendor = await knex('vendors').where({ id: vendorId, status: 'risk_scored' }).first();
    if (!vendor) throw Object.assign(new Error('Vendor not in risk_scored state'), { statusCode: 422 });

    await knex('vendors').where({ id: vendorId }).update({ status: 'board_review', updated_at: knex.fn.now() });

    await knex('board_approvals').insert({
        resource_type: 'vendor',
        resource_id: vendorId,
        action_required: 'approve_or_reject_vendor',
        status: 'pending',
        requested_by: complianceOfficerId,
        deadline_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5-day board SLA
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    logger.audit('VENDOR_ADVANCED_TO_BOARD', complianceOfficerId, 'vendor', vendorId, { notes });
    return { vendorId, status: 'board_review' };
}

module.exports = { calculateVendorRisk, advanceToBoard };
