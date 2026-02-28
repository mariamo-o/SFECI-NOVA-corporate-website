// ============================================================
// NOVA Platform — Vendor Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const vendorCtrl = require('../controllers/vendor.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors, csrfProtect } = require('../middleware/security');
const config = require('../config/env');

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.upload.dir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).slice(1).toLowerCase();
        if (config.upload.allowedTypes.includes(ext)) cb(null, true);
        else cb(new Error(`File type .${ext} not permitted`));
    },
});

// --- Vendor self-service (vendor role) ---
router.post('/',
    authenticate,
    requireRole('vendor'),
    csrfProtect,
    sanitizeRequest,
    vendorCtrl.createValidators,
    handleValidationErrors,
    vendorCtrl.createVendor
);

router.get('/me', authenticate, requireRole('vendor'), vendorCtrl.getMyVendor);

router.post('/documents',
    authenticate,
    requireRole('vendor'),
    csrfProtect,
    upload.array('files', 5),
    vendorCtrl.submitDocuments
);

// --- Admin / compliance ---
router.get('/', authenticate, requireRole('compliance_or_above'), vendorCtrl.listVendors);
router.get('/:id', authenticate, requireRole('compliance_or_above'), vendorCtrl.getVendorById);

router.post('/:id/risk-score',
    authenticate,
    requireRole('compliance_or_above'),
    csrfProtect,
    vendorCtrl.triggerRiskScore
);

router.post('/:id/advance-board',
    authenticate,
    requireRole('compliance_or_above'),
    csrfProtect,
    vendorCtrl.advanceToBoard
);

router.post('/:id/board-decision',
    authenticate,
    requireRole('admin_or_above'),
    csrfProtect,
    sanitizeRequest,
    vendorCtrl.boardDecision
);

module.exports = router;
