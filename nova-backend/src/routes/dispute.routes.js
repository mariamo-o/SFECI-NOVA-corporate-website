// ============================================================
// NOVA Platform — Dispute Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const disputeCtrl = require('../controllers/dispute.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { csrfProtect, handleValidationErrors } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const multer = require('multer');
const path = require('path');
const config = require('../config/env');

const upload = multer({
    dest: config.upload.dir,
    limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        const allowed = config.upload.allowedTypes;
        cb(null, allowed.includes(ext));
    },
});

/**
 * @swagger
 * tags:
 *   name: Disputes
 *   description: Order dispute lifecycle management
 */

/**
 * @swagger
 * /trade/disputes:
 *   post:
 *     tags: [Disputes]
 *     summary: Open a new dispute on an order
 *     security: [{bearerAuth: []}]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, reason, description]
 *             properties:
 *               orderId: { type: string, format: uuid }
 *               reason:
 *                 type: string
 *                 enum: [non_delivery, quality_issue, wrong_item, payment_dispute, breach_of_contract, delivery_delay, other]
 *               description: { type: string, minLength: 20 }
 *               disputedAmount: { type: number }
 *     responses:
 *       201: { description: Dispute opened }
 *       409: { description: Active dispute already exists for this order }
 */
router.post('/',
    authenticate,
    csrfProtect,
    disputeCtrl.createValidators,
    handleValidationErrors,
    disputeCtrl.openDispute
);

/**
 * @swagger
 * /trade/disputes:
 *   get:
 *     tags: [Disputes]
 *     summary: List disputes (role-filtered)
 *     security: [{bearerAuth: []}]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: List of disputes }
 */
router.get('/', authenticate, disputeCtrl.listDisputes);

/**
 * @swagger
 * /trade/disputes/{id}:
 *   get:
 *     tags: [Disputes]
 *     summary: Get dispute details
 *     security: [{bearerAuth: []}]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Dispute detail with evidence and state log }
 */
router.get('/:id', authenticate, disputeCtrl.getDispute);

/**
 * @swagger
 * /trade/disputes/{id}/transition:
 *   post:
 *     tags: [Disputes]
 *     summary: Transition dispute to new status
 *     security: [{bearerAuth: []}]
 */
router.post('/:id/transition',
    authenticate,
    csrfProtect,
    disputeCtrl.transitionValidators,
    handleValidationErrors,
    disputeCtrl.transitionDispute
);

/**
 * @swagger
 * /trade/disputes/{id}/assign:
 *   post:
 *     tags: [Disputes]
 *     summary: Assign dispute to a resolver (admin only)
 *     security: [{bearerAuth: []}]
 */
router.post('/:id/assign',
    authenticate,
    requireRole('super_admin', 'compliance_officer'),
    csrfProtect,
    disputeCtrl.assignDispute
);

/**
 * @swagger
 * /trade/disputes/{id}/evidence:
 *   post:
 *     tags: [Disputes]
 *     summary: Submit evidence for a dispute
 *     security: [{bearerAuth: []}]
 */
router.post('/:id/evidence',
    authenticate,
    csrfProtect,
    upload.single('file'),
    disputeCtrl.submitEvidence
);

module.exports = router;
