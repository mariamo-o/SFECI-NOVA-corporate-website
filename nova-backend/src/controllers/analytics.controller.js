// ============================================================
// NOVA Platform — Analytics Controller
// ============================================================
'use strict';

const analyticsService = require('../services/analytics.service');
const { asyncHandler } = require('../middleware/errorHandler');

function parseDateRange(query) {
    return {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
    };
}

/** GET /analytics/vendors/:id — Vendor performance dashboard */
exports.getVendorPerformance = asyncHandler(async (req, res) => {
    const data = await analyticsService.getVendorPerformance(req.params.id, parseDateRange(req.query));
    res.json({ success: true, data });
});

/** GET /analytics/buyers/:id — Buyer behavior analytics */
exports.getBuyerAnalytics = asyncHandler(async (req, res) => {
    const data = await analyticsService.getBuyerAnalytics(req.params.id, parseDateRange(req.query));
    res.json({ success: true, data });
});

/** GET /analytics/rfqs — RFQ conversion funnel */
exports.getRFQConversion = asyncHandler(async (req, res) => {
    const data = await analyticsService.getRFQConversionFunnel(parseDateRange(req.query));
    res.json({ success: true, data });
});

/** GET /analytics/revenue — Platform GMV */
exports.getRevenue = asyncHandler(async (req, res) => {
    const groupBy = req.query.group_by || 'month';
    const data = await analyticsService.getPlatformGMV(parseDateRange(req.query), groupBy);
    res.json({ success: true, data });
});

/** GET /analytics/trends — Sector trends */
exports.getSectorTrends = asyncHandler(async (req, res) => {
    const data = await analyticsService.getSectorTrends();
    res.json({ success: true, data });
});
