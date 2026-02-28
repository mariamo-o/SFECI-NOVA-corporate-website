// ============================================================
// NOVA Platform — DB Seed Data (Development/Testing)
// ============================================================
'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

exports.seed = async (knex) => {
    // Clear in reverse dependency order
    await knex('rfq_state_log').del();
    await knex('rfq_quotes').del();
    await knex('rfq_items').del();
    await knex('rfqs').del();
    await knex('inventory').del();
    await knex('products').del();
    await knex('product_categories').del();
    await knex('board_approvals').del();
    await knex('vendor_risk_scores').del();
    await knex('vendor_documents').del();
    await knex('vendors').del();
    await knex('refresh_tokens').del();
    await knex('users').del();

    const hash = await bcrypt.hash('Admin@1234!', 12);
    const buyerHash = await bcrypt.hash('Buyer@1234!', 12);
    const vendorHash = await bcrypt.hash('Vendor@1234!', 12);

    const now = knex.fn.now();

    // --- Users ---
    const adminId = uuidv4();
    const complianceId = uuidv4();
    const buyerId = uuidv4();
    const vendorUserId = uuidv4();

    await knex('users').insert([
        { id: adminId, email: 'admin@sfeci.com', password_hash: hash, first_name: 'System', last_name: 'Admin', role: 'super_admin', is_active: true, is_email_verified: true, country: 'FR', created_at: now, updated_at: now },
        { id: complianceId, email: 'compliance@sfeci.com', password_hash: hash, first_name: 'Marie', last_name: 'Dupont', role: 'compliance_officer', is_active: true, is_email_verified: true, country: 'FR', created_at: now, updated_at: now },
        { id: buyerId, email: 'buyer@acme.com', password_hash: buyerHash, first_name: 'John', last_name: 'Smith', role: 'buyer', is_active: true, is_email_verified: true, country: 'GB', created_at: now, updated_at: now },
        { id: vendorUserId, email: 'vendor@techcorp.com', password_hash: vendorHash, first_name: 'Chen', last_name: 'Wei', role: 'vendor', is_active: true, is_email_verified: true, country: 'CN', created_at: now, updated_at: now },
    ]);

    // --- Approved vendor ---
    const vendorId = uuidv4();
    await knex('vendors').insert({
        id: vendorId,
        user_id: vendorUserId,
        company_name: 'TechCorp Shanghai Ltd',
        trade_name: 'TechCorp',
        registration_number: 'CN-2020-TC-001234',
        vat_number: '91310115MA1GL5HH0B',
        country: 'CN',
        address: '888 Lujiazui Ring Road',
        city: 'Shanghai',
        postal_code: '200120',
        website: 'https://techcorp-sh.example.com',
        description: 'Leading industrial IoT and smart manufacturing solutions provider.',
        status: 'approved',
        risk_level: 'low',
        risk_score: 12.50,
        sectors: JSON.stringify(['industrial', 'tech']),
        aml_cleared: true,
        approved_by: adminId,
        approved_at: now,
        created_at: now,
        updated_at: now,
    });

    // --- Product categories ---
    const catIndustrialId = uuidv4();
    const catEnergyId = uuidv4();
    await knex('product_categories').insert([
        { id: catIndustrialId, name: 'Industrial Equipment', slug: 'industrial-equipment', sector: 'industrial', is_active: true, created_at: now, updated_at: now },
        { id: catEnergyId, name: 'Energy Systems', slug: 'energy-systems', sector: 'energy', is_active: true, created_at: now, updated_at: now },
    ]);

    // --- Sample products ---
    const prod1Id = uuidv4();
    await knex('products').insert({
        id: prod1Id,
        vendor_id: vendorId,
        category_id: catIndustrialId,
        name: 'Smart IoT Sensor Array Model-X7',
        sku: 'TC-IOT-X7-001',
        description: 'Industrial-grade IoT sensor array with 4G/5G connectivity, IP67 rated.',
        unit_of_measure: 'units',
        unit_price: 249.99,
        currency: 'EUR',
        origin_country: 'CN',
        hs_code: '9031.80',
        is_compliance_verified: true,
        is_active: true,
        is_published: true,
        created_at: now,
        updated_at: now,
    });

    await knex('inventory').insert({
        id: uuidv4(),
        product_id: prod1Id,
        quantity_available: 500,
        quantity_reserved: 0,
        minimum_order_quantity: 10,
        reorder_level: 50,
        is_in_stock: true,
        lead_time_days: '14-21 days',
        created_at: now,
        updated_at: now,
    });

    console.log('✅ Seed data inserted successfully');
    console.log('   admin@sfeci.com / Admin@1234!');
    console.log('   compliance@sfeci.com / Admin@1234!');
    console.log('   buyer@acme.com / Buyer@1234!');
    console.log('   vendor@techcorp.com / Vendor@1234!');
};
