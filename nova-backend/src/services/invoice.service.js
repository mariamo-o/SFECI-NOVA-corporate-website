// ============================================================
// NOVA Platform — Invoice Service
// Works with existing invoices table from migration 005,
// extended by migration 007 with line items and credit notes.
// Column mapping: 005 uses total_amount/due_at; 007 adds tax_rate/due_date/status_v2.
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const logger = require('../config/logger');

/**
 * Generate auto-incremented invoice number.
 */
async function nextInvoiceNumber() {
    const [{ count }] = await knex('invoices').count('id as count');
    return `INV-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;
}

/**
 * Generate auto-incremented credit note number.
 */
async function nextCreditNoteNumber() {
    const [{ count }] = await knex('credit_notes').count('id as count');
    return `CN-${new Date().getFullYear()}-${String(parseInt(count) + 1).padStart(6, '0')}`;
}

/**
 * Generate an invoice from an existing order.
 * @param {string} orderId - UUID of the order
 * @param {Object} options - Optional: { taxRate, dueInDays, notes }
 * @returns {Object} Created invoice with line items
 */
async function generateFromOrder(orderId, options = {}) {
    const order = await knex('orders').where({ id: orderId }).first();
    if (!order) {
        const err = new Error('Order not found');
        err.statusCode = 404;
        throw err;
    }

    // Prevent duplicate invoices for the same order (skip cancelled ones)
    const existing = await knex('invoices').where({ order_id: orderId }).where('status', '!=', 'cancelled').first();
    if (existing) {
        const err = new Error(`Invoice already exists for this order: ${existing.invoice_number}`);
        err.statusCode = 409;
        throw err;
    }

    const invoiceNumber = await nextInvoiceNumber();
    const invoiceId = uuidv4();

    const taxRate = options.taxRate !== undefined ? options.taxRate : 0.20; // 20% VAT default
    const subtotal = parseFloat(order.total_amount || 0);
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const dueInDays = options.dueInDays || 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueInDays);

    // Fetch order line items if available
    const orderItems = await knex('order_items').where({ order_id: orderId });

    await knex.transaction(async (trx) => {
        // Insert into invoices table — use column names from migration 005
        // (total_amount, due_at are the 005 names; tax_rate, due_date, notes, metadata added by 007)
        const invoiceData = {
            id: invoiceId,
            invoice_number: invoiceNumber,
            order_id: orderId,
            vendor_id: order.vendor_id,
            buyer_id: order.buyer_id,
            status: 'issued',               // 005 string column
            subtotal,
            tax_amount: taxAmount,
            total_amount: total,            // 005 column name
            currency: order.currency || 'EUR',
            issued_at: trx.fn.now(),
            due_at: dueDate,                // 005 column name
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        };

        // Add 007 columns if they exist (safe approach)
        try {
            const hasV2Cols = await knex.schema.hasColumn('invoices', 'tax_rate');
            if (hasV2Cols) {
                invoiceData.tax_rate = taxRate;
                invoiceData.due_date = dueDate;
                if (options.notes) invoiceData.notes = options.notes;
                invoiceData.metadata = JSON.stringify({ source: 'order', orderId });
            }
        } catch (_) { /* 007 migration not yet run */ }

        await trx('invoices').insert(invoiceData);

        // Insert line items (from order_items if available, else a single summary line)
        const hasLineItemsTable = await knex.schema.hasTable('invoice_line_items');
        if (hasLineItemsTable) {
            if (orderItems.length > 0) {
                await trx('invoice_line_items').insert(
                    orderItems.map((item) => ({
                        id: uuidv4(),
                        invoice_id: invoiceId,
                        product_id: item.product_id || null,
                        description: item.name || 'Order item',
                        quantity: item.quantity || 1,
                        unit_price: parseFloat(item.unit_price || 0),
                        line_total: parseFloat(item.total_price || item.unit_price || 0),
                        unit_of_measure: item.unit || null,
                        created_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    }))
                );
            } else {
                await trx('invoice_line_items').insert({
                    id: uuidv4(),
                    invoice_id: invoiceId,
                    description: `Order ${order.order_number || orderId}`,
                    quantity: 1,
                    unit_price: subtotal,
                    line_total: subtotal,
                    created_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                });
            }
        }
    });

    logger.audit('INVOICE_GENERATED', null, 'invoice', invoiceId, { invoiceNumber, orderId, total });
    return getInvoiceSummary(invoiceId);
}

/**
 * Issue a credit note against an invoice.
 * @param {string} invoiceId - UUID of the invoice
 * @param {number} amount - Amount to credit
 * @param {string} reason - Reason for the credit note
 * @param {string} issuedBy - User ID issuing the credit note
 * @returns {Object} Created credit note
 */
async function issueCreditNote(invoiceId, amount, reason, issuedBy) {
    const invoice = await knex('invoices').where({ id: invoiceId }).first();
    if (!invoice) {
        const err = new Error('Invoice not found');
        err.statusCode = 404;
        throw err;
    }

    if (!['issued', 'paid'].includes(invoice.status)) {
        const err = new Error('Credit notes can only be issued on issued or paid invoices.');
        err.statusCode = 422;
        throw err;
    }

    // Use total_amount (005 column) OR total (if 007 renamed it)
    const invoiceTotal = parseFloat(invoice.total_amount || invoice.total || 0);
    if (parseFloat(amount) > invoiceTotal) {
        const err = new Error('Credit note amount cannot exceed invoice total.');
        err.statusCode = 422;
        throw err;
    }

    const creditNoteNumber = await nextCreditNoteNumber();
    const [cn] = await knex('credit_notes').insert({
        id: uuidv4(),
        credit_note_number: creditNoteNumber,
        invoice_id: invoiceId,
        amount,
        currency: invoice.currency,
        reason,
        issued_at: knex.fn.now(),
        issued_by: issuedBy || null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.audit('CREDIT_NOTE_ISSUED', issuedBy, 'credit_note', cn.id, { invoiceId, amount, reason });
    return cn;
}

/**
 * Detect and mark overdue invoices. Called by CRON (daily).
 * Works with both due_at (005) and due_date (007) columns.
 * @returns {{ marked: number }} Count of invoices marked overdue
 */
async function detectOverdue() {
    const now = new Date();

    // Support both column names (due_at from 005, due_date added by 007)
    const hasDueDate = await knex.schema.hasColumn('invoices', 'due_date');
    const dueDateCol = hasDueDate ? 'due_date' : 'due_at';

    const updated = await knex('invoices')
        .where('status', 'issued')
        .where(dueDateCol, '<', now)
        .update({ status: 'overdue', updated_at: knex.fn.now() })
        .returning('id');

    const count = Array.isArray(updated) ? updated.length : updated;
    if (count > 0) {
        logger.warn('[Invoice] Overdue invoices detected', { count });
    }
    return { marked: count };
}

/**
 * Get full invoice detail including line items and credit notes.
 * @param {string} invoiceId
 * @returns {Object} Invoice with line_items and credit_notes
 */
async function getInvoiceSummary(invoiceId) {
    const invoice = await knex('invoices').where({ id: invoiceId }).first();
    if (!invoice) return null;

    const hasLineItems = await knex.schema.hasTable('invoice_line_items');
    const hasCreditNotes = await knex.schema.hasTable('credit_notes');

    const lineItems = hasLineItems
        ? await knex('invoice_line_items').where({ invoice_id: invoiceId })
        : [];

    const creditNotes = hasCreditNotes
        ? await knex('credit_notes').where({ invoice_id: invoiceId }).orderBy('issued_at', 'asc')
        : [];

    const totalCredited = creditNotes.reduce((sum, cn) => sum + parseFloat(cn.amount), 0);
    const invoiceTotal = parseFloat(invoice.total_amount || invoice.total || 0);

    return {
        ...invoice,
        line_items: lineItems,
        credit_notes: creditNotes,
        net_due: Math.max(0, invoiceTotal - totalCredited),
    };
}

module.exports = { generateFromOrder, issueCreditNote, detectOverdue, getInvoiceSummary };
