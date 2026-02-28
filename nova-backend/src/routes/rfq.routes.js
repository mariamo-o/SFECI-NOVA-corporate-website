// ============================================================
// NOVA Platform — RFQ Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const rfqCtrl = require('../controllers/rfq.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors, csrfProtect } = require('../middleware/security');
const { body } = require('express-validator');

// --- Buyer creates & manages RFQs ---
router.post('/',
    authenticate,
    requireRole('buyer', 'admin', 'super_admin'),
    csrfProtect,
    sanitizeRequest,
    rfqCtrl.createValidators,
    handleValidationErrors,
    rfqCtrl.createRFQ
);

router.get('/', authenticate, rfqCtrl.listRFQs);
router.get('/:id', authenticate, rfqCtrl.getRFQ);
router.get('/:id/state-log', authenticate, rfqCtrl.getRFQStateLog);

router.post('/:id/submit',
    authenticate,
    requireRole('buyer', 'admin', 'super_admin'),
    csrfProtect,
    rfqCtrl.submitRFQ
);

// --- Vendor submits quotes ---
router.post('/:id/quotes',
    authenticate,
    requireRole('vendor'),
    csrfProtect,
    sanitizeRequest,
    [
        body('total_amount').isFloat({ min: 0.01 }).withMessage('Total amount required'),
        body('delivery_days').isInt({ min: 1 }).withMessage('Delivery days required'),
        body('valid_until').isISO8601().withMessage('Valid until date required (ISO 8601)'),
    ],
    handleValidationErrors,
    rfqCtrl.submitQuote
);

// --- Buyer selects winning quote ---
router.post('/:id/quotes/:quoteId/select',
    authenticate,
    requireRole('buyer', 'admin'),
    csrfProtect,
    rfqCtrl.selectQuote
);

module.exports = router;
