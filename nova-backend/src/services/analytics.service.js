// ============================================================
// NOVA Platform — Analytics & Trade Intelligence Service
// Event emission, vendor performance, buyer behavior,
// RFQ conversion funnel, platform GMV, sector trends.
// ============================================================
'use strict';

const { knex } = require('../config/database');
const logger = require('../config/logger');

// ============================================================
// EVENT EMISSION (Data Pipeline Entry Point)
// ============================================================

/**
 * Emit a platform event to the event stream.
 * Fire-and-forget — non-fatal if insert fails.
 * @param {string} type - Event type (e.g. 'RFQ_CREATED')
 * @param {string} entityType - Entity (e.g. 'rfq', 'order')
 * @param {string} entityId - UUID of entity
 * @param {string|null} actorId - User who triggered event
 * @param {Object} payload - Additional context data
 */
async function emitEvent(type, entityType, entityId, actorId, payload = {}) {
    try {
        await knex('platform_events').insert({
            event_type: type,
            entity_type: entityType,
            entity_id: entityId || null,
            actor_id: actorId || null,
            payload: JSON.stringify(payload),
            created_at: knex.fn.now(),
        });
    } catch (err) {
        // Non-fatal — analytics must never break core workflows
        logger.error('[Analytics] Event emission failed', { type, entityType, entityId, error: err.message });
    }
}

// ============================================================
// VENDOR PERFORMANCE
// ============================================================

/**
 * Get vendor performance analytics.
 * @param {string} vendorId
 * @param {{ from: Date, to: Date }} dateRange
 * @returns {Object} Performance metrics
 */
async function getVendorPerformance(vendorId, dateRange = {}) {
    const from = dateRange.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days default
    const to = dateRange.to || new Date();

    // Total RFQs where vendor submitted a quote
    const [{ total_rfqs_quoted }] = await knex('rfq_quotes as q')
        .join('vendors as v', 'q.vendor_id', 'v.id')
        .where('v.id', vendorId)
        .whereBetween('q.created_at', [from, to])
        .count('q.id as total_rfqs_quoted');

    // Won quotes
    const [{ won }] = await knex('rfq_quotes as q')
        .join('vendors as v', 'q.vendor_id', 'v.id')
        .where('v.id', vendorId)
        .where('q.status', 'accepted')
        .whereBetween('q.created_at', [from, to])
        .count('q.id as won');

    // Avg response time in hours (estimate from quote created vs rfq notified)
    const avgResponse = await knex('rfq_quotes as q')
        .join('rfqs as r', 'q.rfq_id', 'r.id')
        .join('vendors as v', 'q.vendor_id', 'v.id')
        .where('v.id', vendorId)
        .whereBetween('q.created_at', [from, to])
        .select(knex.raw('AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at))/3600) as avg_response_hours'))
        .first();

    // SLA compliance: quotes within 48h
    const [{ sla_compliant }] = await knex('rfq_quotes as q')
        .join('rfqs as r', 'q.rfq_id', 'r.id')
        .join('vendors as v', 'q.vendor_id', 'v.id')
        .where('v.id', vendorId)
        .whereBetween('q.created_at', [from, to])
        .whereRaw('EXTRACT(EPOCH FROM (q.created_at - r.created_at))/3600 <= 48')
        .count('q.id as sla_compliant');

    // GMV contribution
    const [{ gmv }] = await knex('orders as o')
        .where('o.vendor_id', vendorId)
        .whereIn('o.status', ['completed', 'delivered'])
        .whereBetween('o.created_at', [from, to])
        .sum('o.total_amount as gmv');

    const totalQuoted = parseInt(total_rfqs_quoted) || 0;
    const wonCount = parseInt(won) || 0;
    const slaCompliantCount = parseInt(sla_compliant) || 0;

    return {
        vendorId,
        period: { from, to },
        rfqs_quoted: totalQuoted,
        quotes_won: wonCount,
        win_rate: totalQuoted > 0 ? Math.round((wonCount / totalQuoted) * 100) : 0,
        sla_compliance_rate: totalQuoted > 0 ? Math.round((slaCompliantCount / totalQuoted) * 100) : 0,
        avg_response_hours: Math.round(parseFloat(avgResponse?.avg_response_hours || 0)),
        total_gmv: parseFloat(gmv || 0),
    };
}

// ============================================================
// BUYER ANALYTICS
// ============================================================

/**
 * Get buyer behavior analytics.
 * @param {string} buyerId - User UUID
 * @param {{ from: Date, to: Date }} dateRange
 * @returns {Object} Buyer metrics
 */
async function getBuyerAnalytics(buyerId, dateRange = {}) {
    const from = dateRange.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const to = dateRange.to || new Date();

    const [{ total_rfqs }] = await knex('rfqs').where({ buyer_id: buyerId }).whereBetween('created_at', [from, to]).count('id as total_rfqs');
    const [{ submitted }] = await knex('rfqs').where({ buyer_id: buyerId }).whereIn('status', ['submitted', 'notified', 'quoted', 'comparing', 'selected', 'order_created', 'closed']).whereBetween('created_at', [from, to]).count('id as submitted');
    const [{ orders_placed }] = await knex('orders').where({ buyer_id: buyerId }).whereBetween('created_at', [from, to]).count('id as orders_placed');
    const [{ total_spend }] = await knex('orders').where({ buyer_id: buyerId }).whereIn('status', ['completed', 'delivered']).whereBetween('created_at', [from, to]).sum('total_amount as total_spend');
    const [{ avg_deal }] = await knex('orders').where({ buyer_id: buyerId }).whereBetween('created_at', [from, to]).avg('total_amount as avg_deal');

    // Top sectors
    const topSectors = await knex('rfqs').where({ buyer_id: buyerId }).whereBetween('created_at', [from, to])
        .select('sector').count('id as count').groupBy('sector').orderBy('count', 'desc').limit(5);

    return {
        buyerId,
        period: { from, to },
        total_rfqs: parseInt(total_rfqs) || 0,
        rfqs_submitted: parseInt(submitted) || 0,
        orders_placed: parseInt(orders_placed) || 0,
        total_spend: parseFloat(total_spend || 0),
        avg_deal_size: Math.round(parseFloat(avg_deal || 0)),
        top_sectors: topSectors,
    };
}

// ============================================================
// RFQ CONVERSION FUNNEL
// ============================================================

/**
 * Get RFQ conversion funnel metrics.
 * @param {{ from: Date, to: Date }} dateRange
 * @returns {Object} Stage-by-stage conversion rates
 */
async function getRFQConversionFunnel(dateRange = {}) {
    const from = dateRange.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateRange.to || new Date();

    const stages = ['draft', 'submitted', 'notified', 'quoted', 'comparing', 'selected', 'order_created', 'closed'];
    const counts = {};

    for (const stage of stages) {
        const [{ count }] = await knex('rfqs').where('status', stage).orWhereIn('status',
            stages.slice(stages.indexOf(stage))
        ).whereBetween('created_at', [from, to]).count('id as count');
        counts[stage] = parseInt(count) || 0;
    }

    // Funnel rates
    const total = counts.draft + counts.submitted;
    return {
        period: { from, to },
        funnel: {
            draft: counts.draft,
            submitted: counts.submitted,
            quoted: counts.quoted,
            selected: counts.selected,
            converted_to_order: counts.order_created + counts.closed,
        },
        rates: {
            draft_to_submitted: total > 0 ? Math.round((counts.submitted / total) * 100) : 0,
            submitted_to_quoted: counts.submitted > 0 ? Math.round((counts.quoted / counts.submitted) * 100) : 0,
            quoted_to_selected: counts.quoted > 0 ? Math.round((counts.selected / counts.quoted) * 100) : 0,
            selected_to_order: counts.selected > 0 ? Math.round((counts.order_created / counts.selected) * 100) : 0,
        },
    };
}

// ============================================================
// PLATFORM GMV
// ============================================================

/**
 * Get platform Gross Merchandise Value (GMV).
 * @param {{ from: Date, to: Date }} dateRange
 * @param {string} groupBy - 'day' | 'week' | 'month' | 'sector'
 * @returns {Object} GMV data
 */
async function getPlatformGMV(dateRange = {}, groupBy = 'month') {
    const from = dateRange.from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const to = dateRange.to || new Date();

    const [{ total_gmv }] = await knex('orders')
        .whereIn('status', ['completed', 'delivered'])
        .whereBetween('created_at', [from, to])
        .sum('total_amount as total_gmv');

    const [{ total_orders }] = await knex('orders')
        .whereIn('status', ['completed', 'delivered'])
        .whereBetween('created_at', [from, to])
        .count('id as total_orders');

    let grouped;
    if (groupBy === 'sector') {
        grouped = await knex('orders as o')
            .join('rfqs as r', 'o.rfq_id', 'r.id')
            .whereIn('o.status', ['completed', 'delivered'])
            .whereBetween('o.created_at', [from, to])
            .select('r.sector')
            .sum('o.total_amount as gmv')
            .count('o.id as order_count')
            .groupBy('r.sector')
            .orderBy('gmv', 'desc');
    } else {
        const truncUnit = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : 'month';
        grouped = await knex('orders')
            .whereIn('status', ['completed', 'delivered'])
            .whereBetween('created_at', [from, to])
            .select(knex.raw(`DATE_TRUNC('${truncUnit}', created_at) as period`))
            .sum('total_amount as gmv')
            .count('id as order_count')
            .groupByRaw(`DATE_TRUNC('${truncUnit}', created_at)`)
            .orderBy('period', 'asc');
    }

    return {
        period: { from, to },
        total_gmv: parseFloat(total_gmv || 0),
        total_orders: parseInt(total_orders) || 0,
        avg_order_value: parseInt(total_orders) > 0 ? Math.round(parseFloat(total_gmv || 0) / parseInt(total_orders)) : 0,
        grouped,
    };
}

// ============================================================
// SECTOR TRENDS
// ============================================================

/**
 * Get top growing sectors based on RFQ and order activity.
 * @returns {Array} Ranked sector list with growth indicators
 */
async function getSectorTrends() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Activity in last 30 days vs previous 30 days
    const recent = await knex('rfqs')
        .where('created_at', '>=', thirtyDaysAgo)
        .select('sector').count('id as count').groupBy('sector');

    const prior = await knex('rfqs')
        .whereBetween('created_at', [sixtyDaysAgo, thirtyDaysAgo])
        .select('sector').count('id as count').groupBy('sector');

    const priorMap = Object.fromEntries(prior.map((r) => [r.sector, parseInt(r.count)]));

    const trends = recent.map((r) => {
        const recentCount = parseInt(r.count);
        const priorCount = priorMap[r.sector] || 0;
        const growth = priorCount > 0 ? Math.round(((recentCount - priorCount) / priorCount) * 100) : 100;
        return {
            sector: r.sector,
            rfqs_last_30d: recentCount,
            rfqs_prior_30d: priorCount,
            growth_pct: growth,
            trend: growth > 20 ? 'rising' : growth < -20 ? 'declining' : 'stable',
        };
    }).sort((a, b) => b.growth_pct - a.growth_pct);

    return trends;
}

module.exports = {
    emitEvent,
    getVendorPerformance,
    getBuyerAnalytics,
    getRFQConversionFunnel,
    getPlatformGMV,
    getSectorTrends,
};
