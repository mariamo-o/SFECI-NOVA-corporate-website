// ============================================================
// NOVA Platform — Invoice Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const invoiceCtrl = require('../controllers/invoice.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors, csrfProtect } = require('../middleware/security');

router.post('/',
    authenticate,
    requireRole('admin', 'super_admin', 'compliance_officer', 'buyer'),
    csrfProtect, sanitizeRequest,
    invoiceCtrl.createValidators, handleValidationErrors,
    invoiceCtrl.createInvoice
);

router.get('/', authenticate, invoiceCtrl.listInvoices);
router.get('/:id', authenticate, invoiceCtrl.getInvoice);

router.patch('/:id/status',
    authenticate, requireRole('admin_or_above'), csrfProtect,
    invoiceCtrl.updateStatus
);

router.post('/:id/credit-note',
    authenticate, requireRole('admin_or_above', 'compliance_or_above'), csrfProtect,
    sanitizeRequest, invoiceCtrl.creditNoteValidators, handleValidationErrors,
    invoiceCtrl.issueCreditNote
);

module.exports = router;
