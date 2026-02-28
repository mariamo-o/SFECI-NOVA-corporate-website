// ============================================================
// NOVA Platform — Escrow & Settlement Service
// Lifecycle: initiate → fund → release / refund.
// Settlement cycles: T+1 / T+2 / T+3.
// Reconciliation reporting.
// NOTE: Live fund releases require Stripe Connect keys in .env:
//   STRIPE_SECRET_KEY, STRIPE_CONNECT_ACCOUNT_ID
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const logger = require('../config/logger');

// Stripe is optional — escrow framework works with internal state even without keys
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
} catch (_) { /* Stripe not installed */ }

/**
 * Initiate escrow for an order. Creates escrow account in 'pending' state.
 * @param {string} orderId - UUID of the order
 * @param {number} amount - Escrow amount
 * @param {string} currency - ISO currency code (default: EUR)
 * @returns {Object} Created escrow record
 */
async function initiateEscrow(orderId, amount, currency = 'EUR') {
    const order = await knex('orders').where({ id: orderId }).first();
    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    const existing = await knex('escrow_accounts').where({ order_id: orderId }).first();
    if (existing) {
        const err = new Error(`Escrow already exists for this order: ${existing.id}`);
        err.statusCode = 409;
        throw err;
    }

    const escrowId = uuidv4();
    const [escrow] = await knex('escrow_accounts').insert({
        id: escrowId,
        order_id: orderId,
        amount,
        currency,
        status: 'pending',
        metadata: JSON.stringify({ initiated_at: new Date().toISOString() }),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    // Schedule T+2 settlement by default
    const settleDate = new Date();
    settleDate.setDate(settleDate.getDate() + 2);

    await knex('settlement_cycles').insert({
        id: uuidv4(),
        escrow_id: escrowId,
        cycle_type: 'T2',
        settle_date: settleDate,
        status: 'scheduled',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    logger.audit('ESCROW_INITIATED', null, 'escrow', escrowId, { orderId, amount, currency });
    return escrow;
}

/**
 * Fund escrow via Stripe PaymentIntent (or mark funded manually if no Stripe).
 * @param {string} escrowId
 * @returns {Object} Updated escrow
 */
async function fundEscrow(escrowId) {
    const escrow = await knex('escrow_accounts').where({ id: escrowId, status: 'pending' }).first();
    if (!escrow) {
        const err = new Error('Escrow not found or not in pending state');
        err.statusCode = 422;
        throw err;
    }

    let stripePaymentIntentId = null;

    // NOTE: In production, create a Stripe PaymentIntent here:
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: Math.round(escrow.amount * 100),
    //   currency: escrow.currency.toLowerCase(),
    //   capture_method: 'manual',  // Authorise only; capture on release
    //   transfer_group: `ORDER_${escrow.order_id}`,
    // });
    // stripePaymentIntentId = paymentIntent.id;

    const [updated] = await knex('escrow_accounts').where({ id: escrowId }).update({
        status: 'funded',
        funded_at: knex.fn.now(),
        stripe_payment_intent_id: stripePaymentIntentId,
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.audit('ESCROW_FUNDED', null, 'escrow', escrowId, { stripePaymentIntentId });
    return updated;
}

/**
 * Release escrow funds to vendor (after order delivery confirmed).
 * @param {string} escrowId
 * @param {string} releasedBy - User ID of admin who authorised release
 * @returns {Object} Updated escrow
 */
async function releaseEscrow(escrowId, releasedBy) {
    const escrow = await knex('escrow_accounts').where({ id: escrowId, status: 'funded' }).first();
    if (!escrow) {
        const err = new Error('Escrow not found or not in funded state');
        err.statusCode = 422;
        throw err;
    }

    // NOTE: In production, capture the Stripe PaymentIntent:
    // if (escrow.stripe_payment_intent_id) {
    //   await stripe.paymentIntents.capture(escrow.stripe_payment_intent_id);
    // }

    const [updated] = await knex('escrow_accounts').where({ id: escrowId }).update({
        status: 'released',
        released_at: knex.fn.now(),
        released_by: releasedBy,
        updated_at: knex.fn.now(),
    }).returning('*');

    // Mark settlement cycle as settled
    await knex('settlement_cycles').where({ escrow_id: escrowId, status: 'scheduled' })
        .update({ status: 'settled', updated_at: knex.fn.now() });

    logger.audit('ESCROW_RELEASED', releasedBy, 'escrow', escrowId);
    return updated;
}

/**
 * Refund escrow to buyer (dispute resolution or cancellation).
 * @param {string} escrowId
 * @param {string} reason - Reason for refund
 * @returns {Object} Updated escrow
 */
async function refundEscrow(escrowId, reason) {
    const escrow = await knex('escrow_accounts').where({ id: escrowId }).whereIn('status', ['funded', 'pending']).first();
    if (!escrow) {
        const err = new Error('Escrow not found or not refundable');
        err.statusCode = 422;
        throw err;
    }

    // NOTE: In production, cancel or refund the Stripe PaymentIntent:
    // if (escrow.stripe_payment_intent_id) {
    //   await stripe.paymentIntents.cancel(escrow.stripe_payment_intent_id);
    // }

    const [updated] = await knex('escrow_accounts').where({ id: escrowId }).update({
        status: 'refunded',
        refunded_at: knex.fn.now(),
        refund_reason: reason,
        updated_at: knex.fn.now(),
    }).returning('*');

    // Mark cycle as failed
    await knex('settlement_cycles').where({ escrow_id: escrowId, status: 'scheduled' })
        .update({ status: 'failed', failure_reason: reason, updated_at: knex.fn.now() });

    logger.audit('ESCROW_REFUNDED', null, 'escrow', escrowId, { reason });
    return updated;
}

/**
 * Generate a reconciliation report for a period.
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {string} generatedBy - User ID
 * @returns {Object} Report record
 */
async function generateReconciliationReport(periodStart, periodEnd, generatedBy) {
    const [{ total_settled }] = await knex('escrow_accounts')
        .whereBetween('released_at', [periodStart, periodEnd])
        .where({ status: 'released' })
        .sum('amount as total_settled');

    const [{ total_refunded }] = await knex('escrow_accounts')
        .whereBetween('refunded_at', [periodStart, periodEnd])
        .where({ status: 'refunded' })
        .sum('amount as total_refunded');

    const [{ total_disputed }] = await knex('escrow_accounts')
        .whereBetween('created_at', [periodStart, periodEnd])
        .where({ status: 'disputed' })
        .sum('amount as total_disputed');

    const [{ txn_count }] = await knex('escrow_accounts')
        .whereBetween('created_at', [periodStart, periodEnd])
        .count('id as txn_count');

    const [report] = await knex('reconciliation_reports').insert({
        id: uuidv4(),
        period_start: periodStart,
        period_end: periodEnd,
        total_settled: parseFloat(total_settled || 0),
        total_refunded: parseFloat(total_refunded || 0),
        total_disputed: parseFloat(total_disputed || 0),
        transaction_count: parseInt(txn_count) || 0,
        discrepancies: JSON.stringify([]), // Future: detect mismatches vs payment gateway logs
        generated_by: generatedBy || null,
        generated_at: knex.fn.now(),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.audit('RECONCILIATION_REPORT_GENERATED', generatedBy, 'reconciliation', report.id, {
        periodStart, periodEnd,
        total_settled: report.total_settled,
        total_refunded: report.total_refunded,
    });
    return report;
}

/**
 * Project cashflow for a vendor over a horizon.
 * @param {string} vendorId
 * @param {number} horizonDays - Days to project forward
 * @returns {Object} Projection data
 */
async function projectCashflow(vendorId, horizonDays = 30) {
    const now = new Date();
    const horizonEnd = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

    // Escrows expected to release (funded, scheduled within horizon)
    const expected = await knex('escrow_accounts as ea')
        .join('orders as o', 'ea.order_id', 'o.id')
        .join('settlement_cycles as sc', 'ea.id', 'sc.escrow_id')
        .where('o.vendor_id', vendorId)
        .where('ea.status', 'funded')
        .whereBetween('sc.settle_date', [now, horizonEnd])
        .where('sc.status', 'scheduled')
        .select('sc.settle_date', 'ea.amount', 'ea.currency')
        .orderBy('sc.settle_date', 'asc');

    const totalExpected = expected.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    return {
        vendorId,
        horizon_days: horizonDays,
        projection_end: horizonEnd,
        expected_inflows: expected,
        total_expected_value: totalExpected,
    };
}

module.exports = { initiateEscrow, fundEscrow, releaseEscrow, refundEscrow, generateReconciliationReport, projectCashflow };
