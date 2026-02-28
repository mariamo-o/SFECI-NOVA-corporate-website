// ============================================================
// NOVA Platform — Product Routes
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const productCtrl = require('../controllers/product.controller');
const { authenticate, requireRole, optionalAuth } = require('../middleware/auth');
const { sanitizeRequest, handleValidationErrors, csrfProtect } = require('../middleware/security');

// ---- Categories (public read, admin write) ----
router.get('/categories', authenticate, optionalAuth, productCtrl.listCategories);

router.post('/categories',
    authenticate,
    requireRole('admin_or_above'),
    csrfProtect,
    sanitizeRequest,
    handleValidationErrors,
    productCtrl.createCategory
);

// ---- Products ----

// List products (role-filtered inside controller)
router.get('/', authenticate, productCtrl.listProducts);

// Create product (vendors and admins)
router.post('/',
    authenticate,
    requireRole('vendor', 'admin', 'super_admin'),
    csrfProtect,
    sanitizeRequest,
    productCtrl.createProductValidators,
    handleValidationErrors,
    productCtrl.createProduct
);

// Get product by ID
router.get('/:id', authenticate, productCtrl.getProduct);

// Update product
router.put('/:id',
    authenticate,
    requireRole('vendor', 'admin', 'super_admin'),
    csrfProtect,
    sanitizeRequest,
    productCtrl.updateProductValidators,
    handleValidationErrors,
    productCtrl.updateProduct
);

// Soft-delete product
router.delete('/:id',
    authenticate,
    requireRole('vendor', 'admin', 'super_admin'),
    csrfProtect,
    productCtrl.deleteProduct
);

// Publish / unpublish
router.post('/:id/publish',
    authenticate,
    requireRole('vendor', 'admin', 'super_admin'),
    csrfProtect,
    productCtrl.publishProduct
);

// Sync inventory
router.put('/:id/inventory',
    authenticate,
    requireRole('vendor', 'admin', 'super_admin'),
    csrfProtect,
    sanitizeRequest,
    productCtrl.inventoryValidators,
    handleValidationErrors,
    productCtrl.syncInventory
);

module.exports = router;
