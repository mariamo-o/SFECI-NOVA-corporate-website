// ============================================================
// NOVA Platform — AI Governance Routes (admin/compliance gated)
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const aiCtrl = require('../controllers/aiGovernance.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors, csrfProtect } = require('../middleware/security');

const adminGate = [authenticate, requireRole('compliance_or_above')];

router.get('/decisions', ...adminGate, aiCtrl.listDecisions);
router.get('/decisions/:id', ...adminGate, aiCtrl.getExplainability);
router.post('/decisions/:id/override',
    ...adminGate, csrfProtect, sanitizeRequest,
    aiCtrl.overrideValidators, handleValidationErrors,
    aiCtrl.overrideDecision
);
router.get('/escalations', ...adminGate, aiCtrl.listEscalations);
router.get('/stats', ...adminGate, aiCtrl.getStats);

module.exports = router;
