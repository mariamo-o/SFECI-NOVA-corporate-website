// ============================================================
// NOVA Platform — Payment & Order Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const paymentSvc = require('../services/payment.service');
const { authenticate, requireRole } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const { knex } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// --- Initiate payment (buyer) ---
router.post('/orders/:orderId/pay',
    authenticate,
    requireRole('buyer', 'admin'),
    csrfProtect,
    paymentSvc.initiatePayment
);

// --- Release escrow (admin or system trigger on delivery confirmation) ---
router.post('/orders/:orderId/release',
    authenticate,
    requireRole('admin_or_above'),
    csrfProtect,
    paymentSvc.releasePayment
);

// --- Payment status ---
router.get('/orders/:orderId/payment-status',
    authenticate,
    paymentSvc.getPaymentStatus
);

// --- Create order from selected RFQ quote ---
router.post('/orders',
    authenticate,
    requireRole('buyer', 'admin'),
    csrfProtect,
    asyncHandler(async (req, res) => {
        const { rfqId, quoteId, delivery_address, delivery_country, required_delivery_date, buyer_notes } = req.body;

        const rfq = await knex('rfqs').where({ id: rfqId, selected_quote_id: quoteId, status: 'selected' }).first();
        if (!rfq) return res.status(422).json({ success: false, error: 'RFQ must be in selected state with a quote.' });

        const quote = await knex('rfq_quotes').where({ id: quoteId, status: 'accepted' }).first();
        if (!quote) return res.status(404).json({ success: false, error: 'Quote not found.' });

        const [{ count }] = await knex('orders').count('id as count');
        const orderNumber = `ORD-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;

        const [order] = await knex.transaction(async (trx) => {
            const [o] = await trx('orders').insert({
                id: uuidv4(),
                order_number: orderNumber,
                rfq_id: rfqId,
                quote_id: quoteId,
                buyer_id: req.user.id,
                vendor_id: quote.vendor_id,
                status: 'pending',
                total_amount: quote.total_amount,
                currency: quote.currency,
                delivery_address,
                delivery_country,
                required_delivery_date,
                buyer_notes,
                created_at: trx.fn.now(),
                updated_at: trx.fn.now(),
            }).returning('*');

            // Insert order items from quote line items
            const lineItems = quote.line_items || [];
            if (lineItems.length > 0) {
                await trx('order_items').insert(
                    lineItems.map((li) => ({
                        id: uuidv4(),
                        order_id: o.id,
                        name: li.name,
                        quantity: li.quantity,
                        unit: li.unit,
                        unit_price: li.unit_price,
                        total_price: li.total,
                        currency: quote.currency,
                        created_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    }))
                );
            }

            // State transition: RFQ → order_created
            await trx('rfq_state_log').insert({
                rfq_id: rfqId,
                from_status: 'selected',
                to_status: 'order_created',
                transitioned_by: req.user.id,
                notes: `Order ${orderNumber} created`,
                created_at: trx.fn.now(),
            });
            await trx('rfqs').where({ id: rfqId }).update({ status: 'order_created', updated_at: trx.fn.now() });

            return [o];
        });

        logger.audit('ORDER_CREATED', req.user.id, 'order', order.id, { orderNumber, rfqId, quoteId });
        res.status(201).json({ success: true, message: 'Order created. Proceed to payment.', data: order });
    })
);

// --- Get order details ---
router.get('/orders/:id',
    authenticate,
    asyncHandler(async (req, res) => {
        const order = await knex('orders').where({ id: req.params.id }).first();
        if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });

        // Access control
        if (req.user.role === 'buyer' && order.buyer_id !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied.' });

        const items = await knex('order_items').where({ order_id: order.id });
        const payments = await knex('payments').where({ order_id: order.id });
        const stateLog = await knex('order_state_log').where({ order_id: order.id }).orderBy('created_at', 'asc');
        res.json({ success: true, data: { ...order, items, payments, stateLog } });
    })
);

module.exports = router;
