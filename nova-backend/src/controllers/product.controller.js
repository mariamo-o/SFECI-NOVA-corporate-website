// ============================================================
// NOVA Platform — Product & Catalog Controller
// CRUD for products, categories, and inventory management.
// Vendors manage own; admins manage all; buyers read only.
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');
const { knex } = require('../config/database');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { body, query } = require('express-validator');

// ---- Validators ----

exports.createProductValidators = [
    body('name').trim().isLength({ min: 3, max: 500 }).withMessage('Product name required (3-500 chars)'),
    body('sku').trim().isLength({ min: 1, max: 100 }).withMessage('SKU required'),
    body('unit_of_measure').optional().trim().isLength({ max: 50 }),
    body('unit_price').optional().isFloat({ min: 0 }).withMessage('Unit price must be non-negative'),
    body('currency').optional().isLength({ min: 3, max: 3 }).toUpperCase(),
    body('hs_code').optional().trim().isLength({ max: 20 }),
    body('origin_country').optional().isISO31661Alpha2(),
    body('category_id').optional().isUUID(),
];

exports.updateProductValidators = [
    body('name').optional().trim().isLength({ min: 3, max: 500 }),
    body('unit_price').optional().isFloat({ min: 0 }),
    body('is_active').optional().isBoolean(),
];

exports.inventoryValidators = [
    body('quantity_available').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('minimum_order_quantity').optional().isInt({ min: 1 }),
    body('reorder_level').optional().isInt({ min: 0 }),
    body('lead_time_days').optional().trim(),
];

// ---- Helpers ----

/**
 * Resolve vendor_id from req.user — vendors get their own, admins can specify.
 */
async function resolveVendorId(req) {
    if (['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        return req.body.vendor_id || null;
    }
    const vendor = await knex('vendors').where({ user_id: req.user.id, status: 'approved' }).first();
    if (!vendor) {
        const err = new Error('Only approved vendors may manage products.');
        err.statusCode = 403;
        throw err;
    }
    return vendor.id;
}

// ============================================================
// PRODUCTS
// ============================================================

/**
 * POST /products — Create a new product
 */
exports.createProduct = asyncHandler(async (req, res) => {
    const vendorId = await resolveVendorId(req);
    if (!vendorId) return res.status(400).json({ success: false, error: 'vendor_id required for admin product creation.' });

    const {
        name, sku, description, specifications, unit_of_measure, unit_price, currency,
        origin_country, hs_code, category_id, compliance_certifications, images, tags,
    } = req.body;

    // Enforce SKU uniqueness per vendor
    const existing = await knex('products').where({ vendor_id: vendorId, sku }).first();
    if (existing) return res.status(409).json({ success: false, error: `SKU '${sku}' already exists for this vendor.` });

    const productId = uuidv4();
    const [product] = await knex.transaction(async (trx) => {
        const [prod] = await trx('products').insert({
            id: productId,
            vendor_id: vendorId,
            category_id: category_id || null,
            name,
            sku,
            description: description || null,
            specifications: specifications ? JSON.stringify(specifications) : '{}',
            unit_of_measure: unit_of_measure || null,
            unit_price: unit_price || null,
            currency: currency || 'EUR',
            origin_country: origin_country || null,
            hs_code: hs_code || null,
            compliance_certifications: JSON.stringify(compliance_certifications || []),
            images: JSON.stringify(images || []),
            tags: JSON.stringify(tags || []),
            is_active: true,
            is_published: false,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        }).returning('*');

        // Create inventory record
        await trx('inventory').insert({
            id: uuidv4(),
            product_id: productId,
            quantity_available: 0,
            quantity_reserved: 0,
            minimum_order_quantity: 1,
            is_in_stock: false,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
        });

        return [prod];
    });

    logger.audit('PRODUCT_CREATED', req.user.id, 'product', productId, { sku, vendorId });
    res.status(201).json({ success: true, message: 'Product created.', data: product });
});

/**
 * GET /products — List products with filters
 */
exports.listProducts = asyncHandler(async (req, res) => {
    const { sector, category_id, vendor_id, is_published, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = knex('products as p')
        .leftJoin('product_categories as pc', 'p.category_id', 'pc.id')
        .leftJoin('vendors as v', 'p.vendor_id', 'v.id')
        .leftJoin('inventory as inv', 'p.id', 'inv.product_id')
        .select(
            'p.*',
            'pc.name as category_name',
            'pc.sector as category_sector',
            'v.company_name as vendor_name',
            'inv.quantity_available',
            'inv.is_in_stock'
        )
        .orderBy('p.created_at', 'desc');

    // RBAC: vendors see only their own; buyers/public see published
    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
        if (vendor) query = query.where('p.vendor_id', vendor.id);
    } else if (req.user.role === 'buyer') {
        query = query.where({ 'p.is_published': true, 'p.is_active': true });
    }

    if (sector) query = query.where('pc.sector', sector);
    if (category_id) query = query.where('p.category_id', category_id);
    if (vendor_id && ['admin', 'super_admin', 'compliance_officer'].includes(req.user.role)) {
        query = query.where('p.vendor_id', vendor_id);
    }
    if (is_published !== undefined) query = query.where('p.is_published', is_published === 'true');
    if (search) {
        query = query.where((q) =>
            q.whereILike('p.name', `%${search}%`)
                .orWhereILike('p.sku', `%${search}%`)
                .orWhereILike('p.description', `%${search}%`)
        );
    }

    const [{ count }] = await query.clone().clearSelect().count('p.id as count');
    const products = await query.limit(parseInt(limit)).offset(offset);

    res.json({
        success: true,
        data: products,
        pagination: {
            total: parseInt(count),
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(count / limit),
        },
    });
});

/**
 * GET /products/:id — Get product with full detail
 */
exports.getProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const product = await knex('products as p')
        .leftJoin('product_categories as pc', 'p.category_id', 'pc.id')
        .leftJoin('vendors as v', 'p.vendor_id', 'v.id')
        .leftJoin('inventory as inv', 'p.id', 'inv.product_id')
        .select('p.*', 'pc.name as category_name', 'pc.sector', 'v.company_name as vendor_name',
            'inv.quantity_available', 'inv.quantity_reserved', 'inv.minimum_order_quantity',
            'inv.is_in_stock', 'inv.lead_time_days')
        .where('p.id', id)
        .first();

    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    // Buyers can only see published products
    if (req.user.role === 'buyer' && !product.is_published) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    res.json({ success: true, data: product });
});

/**
 * PUT /products/:id — Update product
 */
exports.updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const product = await knex('products').where({ id }).first();
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    // Vendors may only update their own
    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
        if (!vendor || vendor.id !== product.vendor_id) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }
    }

    const allowedFields = ['name', 'description', 'specifications', 'unit_of_measure',
        'unit_price', 'currency', 'origin_country', 'hs_code', 'category_id',
        'compliance_certifications', 'images', 'tags', 'is_active'];

    const updates = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            if (['specifications', 'compliance_certifications', 'images', 'tags'].includes(field)) {
                updates[field] = JSON.stringify(req.body[field]);
            } else {
                updates[field] = req.body[field];
            }
        }
    }
    updates.updated_at = knex.fn.now();

    const [updated] = await knex('products').where({ id }).update(updates).returning('*');
    logger.audit('PRODUCT_UPDATED', req.user.id, 'product', id, Object.keys(updates));
    res.json({ success: true, message: 'Product updated.', data: updated });
});

/**
 * DELETE /products/:id — Soft delete (mark inactive)
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const product = await knex('products').where({ id }).first();
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
        if (!vendor || vendor.id !== product.vendor_id) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }
    }

    await knex('products').where({ id }).update({ is_active: false, is_published: false, updated_at: knex.fn.now() });
    logger.audit('PRODUCT_DELETED', req.user.id, 'product', id);
    res.json({ success: true, message: 'Product deactivated.' });
});

/**
 * POST /products/:id/publish — Toggle publish state
 */
exports.publishProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { publish } = req.body; // true or false

    const product = await knex('products').where({ id }).first();
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
        if (!vendor || vendor.id !== product.vendor_id) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }
    }

    const [updated] = await knex('products')
        .where({ id })
        .update({ is_published: !!publish, updated_at: knex.fn.now() })
        .returning(['id', 'name', 'sku', 'is_published']);

    logger.audit(publish ? 'PRODUCT_PUBLISHED' : 'PRODUCT_UNPUBLISHED', req.user.id, 'product', id);
    res.json({ success: true, message: `Product ${publish ? 'published' : 'unpublished'}.`, data: updated });
});

// ============================================================
// INVENTORY SYNC
// ============================================================

/**
 * PUT /products/:id/inventory — Sync inventory for a product
 */
exports.syncInventory = asyncHandler(async (req, res) => {
    const { id: productId } = req.params;
    const { quantity_available, minimum_order_quantity, reorder_level, lead_time_days } = req.body;

    const product = await knex('products').where({ id: productId }).first();
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    if (req.user.role === 'vendor') {
        const vendor = await knex('vendors').where({ user_id: req.user.id }).first();
        if (!vendor || vendor.id !== product.vendor_id) {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }
    }

    const updates = {
        quantity_available,
        is_in_stock: quantity_available > 0,
        last_synced_at: new Date(),
        updated_at: knex.fn.now(),
    };
    if (minimum_order_quantity !== undefined) updates.minimum_order_quantity = minimum_order_quantity;
    if (reorder_level !== undefined) updates.reorder_level = reorder_level;
    if (lead_time_days !== undefined) updates.lead_time_days = lead_time_days;

    const [inv] = await knex('inventory').where({ product_id: productId }).update(updates).returning('*');
    logger.audit('INVENTORY_SYNCED', req.user.id, 'inventory', productId, { quantity_available });
    res.json({ success: true, message: 'Inventory updated.', data: inv });
});

// ============================================================
// CATEGORIES
// ============================================================

/**
 * GET /products/categories — List all product categories
 */
exports.listCategories = asyncHandler(async (req, res) => {
    const { sector } = req.query;
    let query = knex('product_categories').where({ is_active: true }).orderBy('sector').orderBy('sort_order');
    if (sector) query = query.where({ sector });

    const categories = await query;
    res.json({ success: true, data: categories });
});

/**
 * POST /products/categories — Create a category (admin only)
 */
exports.createCategory = asyncHandler(async (req, res) => {
    const { name, slug, sector, description, parent_id, sort_order } = req.body;

    const [cat] = await knex('product_categories').insert({
        id: uuidv4(),
        name,
        slug,
        sector,
        description: description || null,
        parent_id: parent_id || null,
        sort_order: sort_order || 0,
        is_active: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
    }).returning('*');

    logger.audit('CATEGORY_CREATED', req.user.id, 'product_category', cat.id, { name, sector });
    res.status(201).json({ success: true, message: 'Category created.', data: cat });
});
