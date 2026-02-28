// ============================================================
// NOVA Platform — Marketplace Liquidity Baseline Seed
// Seeds 25 categories (5 per sector), 15 vendor profiles (3 per sector),
// and 150 products (10 per vendor) to establish baseline liquidity.
// All seeded entities flagged with is_seed_data: true in metadata.
// Run: npm run seed
// ============================================================
'use strict';

const { v4: uuidv4 } = require('uuid');

const SECTORS = ['energy', 'industrial', 'medical', 'trading', 'mega_projects'];

const CATEGORY_TEMPLATES = {
    energy: [
        { name: 'Solar PV Panels', slug: 'solar-pv-panels' },
        { name: 'Wind Turbine Components', slug: 'wind-turbine-components' },
        { name: 'Power Transformers', slug: 'power-transformers' },
        { name: 'Energy Storage / Batteries', slug: 'energy-storage-batteries' },
        { name: 'Grid Infrastructure', slug: 'grid-infrastructure' },
    ],
    industrial: [
        { name: 'Heavy Machinery', slug: 'heavy-machinery' },
        { name: 'Industrial Pumps & Valves', slug: 'industrial-pumps-valves' },
        { name: 'Structural Steel', slug: 'structural-steel' },
        { name: 'Compressors & Generators', slug: 'compressors-generators' },
        { name: 'Safety & PPE Equipment', slug: 'safety-ppe-equipment' },
    ],
    medical: [
        { name: 'Diagnostic Imaging', slug: 'diagnostic-imaging' },
        { name: 'Surgical Instruments', slug: 'surgical-instruments' },
        { name: 'Pharmaceutical Supplies', slug: 'pharmaceutical-supplies' },
        { name: 'Hospital Infrastructure', slug: 'hospital-infrastructure' },
        { name: 'Sterilization Equipment', slug: 'sterilization-equipment' },
    ],
    trading: [
        { name: 'Agricultural Commodities', slug: 'agricultural-commodities' },
        { name: 'Grain & Cereals', slug: 'grain-cereals' },
        { name: 'Fertilizers & Agrochemicals', slug: 'fertilizers-agrochemicals' },
        { name: 'Seafood & Frozen Foods', slug: 'seafood-frozen-foods' },
        { name: 'Livestock & Animal Feed', slug: 'livestock-animal-feed' },
    ],
    mega_projects: [
        { name: 'Urban Infrastructure', slug: 'urban-infrastructure' },
        { name: 'Entertainment & Theme Parks', slug: 'entertainment-theme-parks' },
        { name: 'Smart City Technology', slug: 'smart-city-technology' },
        { name: 'Stadium & Arena Construction', slug: 'stadium-arena-construction' },
        { name: 'Residential Development', slug: 'residential-development' },
    ],
};

const COUNTRY_BY_SECTOR = {
    energy: ['DE', 'ES', 'FR', 'DK', 'NL'],
    industrial: ['DE', 'IT', 'PL', 'CZ', 'SE'],
    medical: ['CH', 'DE', 'NL', 'FR', 'BE'],
    trading: ['FR', 'UA', 'AR', 'BR', 'AU'],
    mega_projects: ['AE', 'SA', 'QA', 'SG', 'CN'],
};

exports.seed = async (knex) => {
    // ---- 1. Seed Categories ----
    const categoryIds = {};
    for (const sector of SECTORS) {
        categoryIds[sector] = [];
        for (const cat of CATEGORY_TEMPLATES[sector]) {
            const existing = await knex('product_categories').where({ slug: cat.slug }).first();
            if (existing) {
                categoryIds[sector].push(existing.id);
                continue;
            }
            const id = uuidv4();
            await knex('product_categories').insert({
                id,
                name: cat.name,
                slug: cat.slug,
                sector,
                description: `${cat.name} for the ${sector} sector.`,
                sort_order: CATEGORY_TEMPLATES[sector].indexOf(cat),
                is_active: true,
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
            categoryIds[sector].push(id);
        }
    }

    // ---- 2. Seed Vendor Users + Vendor Profiles ----
    const vendorIds = {};
    for (const sector of SECTORS) {
        vendorIds[sector] = [];
        const countries = COUNTRY_BY_SECTOR[sector];
        for (let i = 0; i < 3; i++) {
            const userId = uuidv4();
            const vendorId = uuidv4();
            const country = countries[i % countries.length];
            const company = `Seed ${sector.charAt(0).toUpperCase() + sector.slice(1)} Supplier ${i + 1}`;
            const email = `seed.vendor.${sector}.${i + 1}@example.com`;

            // Check if user already seeded
            const existingUser = await knex('users').where({ email }).first();
            if (existingUser) {
                const existingVendor = await knex('vendors').where({ user_id: existingUser.id }).first();
                if (existingVendor) { vendorIds[sector].push(existingVendor.id); continue; }
            }

            if (!existingUser) {
                await knex('users').insert({
                    id: userId,
                    email,
                    password_hash: '$2b$12$seed_hash_placeholder_do_not_use_in_prod', // Non-functional
                    first_name: 'Seed',
                    last_name: `${sector} Vendor ${i + 1}`,
                    role: 'vendor',
                    is_active: true,
                    is_email_verified: true,
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now(),
                });
            }

            const actualUserId = existingUser ? existingUser.id : userId;
            await knex('vendors').insert({
                id: vendorId,
                user_id: actualUserId,
                company_name: company,
                trade_name: company,
                registration_number: `REG-SEED-${sector.toUpperCase()}-${i + 1}`,
                vat_number: `VAT-SEED-${country}-${i + 1}`,
                country,
                address: `${100 + i} Seed Street`,
                city: 'Seed City',
                postal_code: '00000',
                website: `https://seed-${sector}-${i + 1}.example.com`,
                description: `Seeded ${sector} supplier for marketplace liquidity baseline. is_seed_data=true`,
                sectors: JSON.stringify([sector]),
                status: 'approved',
                aml_cleared: true,
                risk_score: 15,
                risk_level: 'low',
                metadata: JSON.stringify({ is_seed_data: true }),
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
            vendorIds[sector].push(vendorId);
        }
    }

    // ---- 3. Seed Products (10 per vendor) ----
    for (const sector of SECTORS) {
        const cats = categoryIds[sector];
        for (const vendorId of vendorIds[sector]) {
            for (let p = 0; p < 10; p++) {
                const sku = `SEED-${sector.toUpperCase().slice(0, 3)}-${vendorId.slice(0, 4).toUpperCase()}-${String(p + 1).padStart(3, '0')}`;
                const existing = await knex('products').where({ vendor_id: vendorId, sku }).first();
                if (existing) continue;

                const productId = uuidv4();
                const catId = cats[p % cats.length];
                const price = (Math.round((50 + Math.random() * 5000) * 100) / 100);

                await knex('products').insert({
                    id: productId,
                    vendor_id: vendorId,
                    category_id: catId,
                    name: `Seed Product ${p + 1} — ${sector}`,
                    sku,
                    description: `Sample seeded product for ${sector} marketplace liquidity. is_seed_data=true`,
                    specifications: JSON.stringify({ seeded: true, sector }),
                    unit_of_measure: ['pcs', 'kg', 'm²', 'unit', 'set'][p % 5],
                    unit_price: price,
                    currency: 'EUR',
                    origin_country: COUNTRY_BY_SECTOR[sector][p % COUNTRY_BY_SECTOR[sector].length],
                    is_compliance_verified: true,
                    is_active: true,
                    is_published: true,
                    images: JSON.stringify([]),
                    tags: JSON.stringify([sector, 'seeded', 'liquidity-baseline']),
                    metadata: JSON.stringify({ is_seed_data: true }),
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now(),
                });

                await knex('inventory').insert({
                    id: uuidv4(),
                    product_id: productId,
                    quantity_available: Math.floor(Math.random() * 1000) + 100,
                    quantity_reserved: 0,
                    minimum_order_quantity: 1,
                    is_in_stock: true,
                    lead_time_days: `${Math.floor(Math.random() * 14) + 1} days`,
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now(),
                });
            }
        }
    }

    console.log('[Seed] Liquidity baseline complete: 25 categories, 15 vendors, 150 products seeded.');
};
