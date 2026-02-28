// ============================================================
// NOVA Platform — Stripe Payment Service (Abstraction Layer)
// Phase 1: Scaffold only (no live charges until keys provided)
// Phase 2+: Replace with live Stripe calls
// ============================================================
'use strict';

const config = require('../config/env');
const logger = require('../config/logger');
const { knex } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler } = require('../middleware/errorHandler');

// Initialize Stripe (graceful if key not set)
let stripe = null;
if (config.stripe.secretKey && !config.stripe.secretKey.includes('changeme')) {
    stripe = require('stripe')(config.stripe.secretKey);
    logger.info('Stripe initialized in live mode');
} else {
    logger.warn('Stripe not configured — payment endpoints will return scaffolded responses');
}

/**
 * Create a payment intent for an order (escrow pattern)
 * In Phase 1: returns simulated response
 * In Phase 2: calls Stripe API with real key
 */
async function createPaymentIntent(orderId, amount, currency, buyerEmail) {
    const paymentRef = `PAY-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    if (!stripe) {
        // Scaffold: simulate payment intent creation
        logger.info('[SCAFFOLD] Simulated payment intent created', { orderId, amount, currency });
        return {
            id: `pi_simulated_${uuidv4().slice(0, 16)}`,
            status: 'requires_payment_method',
            amount: Math.round(amount * 100), // Stripe cents
            currency,
            paymentReference: paymentRef,
            scaffolded: true,
            note: 'Configure STRIPE_SECRET_KEY in .env to enable live payments',
        };
    }

    // Live Stripe call
    const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        receipt_email: buyerEmail,
        metadata: { orderId, paymentReference: paymentRef },
        capture_method: 'manual', // Manual capture = escrow pattern
    });

    return { ...intent, paymentReference: paymentRef };
}

/**
 * Release escrow — capture a previously authorized payment
 */
async function releaseEscrow(paymentIntentId) {
    if (!stripe) {
        logger.info('[SCAFFOLD] Simulated escrow release', { paymentIntentId });
        return { status: 'captured', scaffolded: true };
    }
    return stripe.paymentIntents.capture(paymentIntentId);
}

/**
 * Refund a payment
 */
async function refundPayment(paymentIntentId, amount, reason = 'requested_by_customer') {
    if (!stripe) {
        logger.info('[SCAFFOLD] Simulated refund', { paymentIntentId, amount });
        return { status: 'succeeded', scaffolded: true };
    }
    return stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason,
    });
}

// --- HTTP Handlers ---
exports.initiatePayment = asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const order = await knex('orders')
        .where({ id: orderId, buyer_id: req.user.id, status: 'confirmed' })
        .first();

    if (!order) return res.status(404).json({ success: false, error: 'Order not found or not in confirmed state.' });

    const buyer = await knex('users').where({ id: req.user.id }).select('email').first();
    const intent = await createPaymentIntent(orderId, order.total_amount, order.currency, buyer.email);

    // Record in payments table
    await knex('payments').insert({
        id: uuidv4(),
        order_id: orderId,
        payment_reference: intent.paymentReference,
        gateway: 'stripe',
        gateway_payment_id: intent.id,
        status: 'authorized',
        amount: order.total_amount,
        currency: order.currency,
        is_escrowed: true,
        escrowed_at: knex.fn.now(),
        gateway_metadata: JSON.stringify(intent),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    // Advance order to payment_held
    await knex('orders').where({ id: orderId }).update({ status: 'payment_held', updated_at: knex.fn.now() });

    res.json({
        success: true,
        message: 'Payment initiated and funds held in escrow.',
        data: {
            paymentReference: intent.paymentReference,
            gatewayPaymentId: intent.id,
            amount: order.total_amount,
            currency: order.currency,
            ...(intent.scaffolded && { note: intent.note }),
        },
    });
});

exports.releasePayment = asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const payment = await knex('payments')
        .where({ order_id: orderId, status: 'escrowed' })
        .orWhere({ order_id: orderId, status: 'authorized' })
        .first();

    if (!payment) return res.status(404).json({ success: false, error: 'No escrowed payment found for this order.' });

    const result = await releaseEscrow(payment.gateway_payment_id);

    await knex('payments').where({ id: payment.id }).update({
        status: 'released',
        released_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    });

    await knex('orders').where({ id: orderId }).update({ status: 'completed', completed_at: knex.fn.now(), updated_at: knex.fn.now() });

    logger.audit('PAYMENT_RELEASED', req.user.id, 'payment', payment.id, { orderId });
    res.json({ success: true, message: 'Escrow released. Order marked complete.', data: result });
});

exports.getPaymentStatus = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const payment = await knex('payments').where({ order_id: orderId }).orderBy('created_at', 'desc').first();
    if (!payment) return res.status(404).json({ success: false, error: 'No payment record found.' });

    res.json({
        success: true, data: {
            reference: payment.payment_reference,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            isEscrowed: payment.is_escrowed,
            escrowedAt: payment.escrowed_at,
            releasedAt: payment.released_at,
        }
    });
});

module.exports = {
    createPaymentIntent,
    releaseEscrow,
    refundPayment,
    initiatePayment: exports.initiatePayment,
    releasePayment: exports.releasePayment,
    getPaymentStatus: exports.getPaymentStatus,
};
