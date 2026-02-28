// ============================================================
// NOVA Platform — Analytics Routes (admin/compliance gated)
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const analyticsCtrl = require('../controllers/analytics.controller');
const { authenticate, requireRole } = require('../middleware/auth');

const adminGate = [authenticate, requireRole('compliance_or_above')];

router.get('/vendors/:id', ...adminGate, analyticsCtrl.getVendorPerformance);
router.get('/buyers/:id', ...adminGate, analyticsCtrl.getBuyerAnalytics);
router.get('/rfqs', ...adminGate, analyticsCtrl.getRFQConversion);
router.get('/revenue', ...adminGate, analyticsCtrl.getRevenue);
router.get('/trends', authenticate, analyticsCtrl.getSectorTrends); // Buyers can see trends

module.exports = router;
