// ============================================================
// NOVA Platform — Swagger / OpenAPI Configuration
// Auto-generates API docs at /api-docs
// ============================================================
'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NOVA Platform API',
            version: '1.0.0',
            description: `
**SFECI NOVA B2B Trade Platform** — REST API Reference

NOVA is a cloud-native, AI-governed international B2B and dropshipping trade platform.

## Authentication
All protected endpoints require a JWT Bearer token obtained via \`POST /auth/login\`.
Tokens are also set as httpOnly cookies automatically.

## Base URL
\`/api/v1\`

## Rate Limiting
- Auth endpoints: 20 requests / 15 minutes
- API endpoints: 500 requests / 15 minutes
            `,
            contact: {
                name: 'SFECI NOVA Support',
                email: 'api@sfeci.com',
                url: 'https://sfeci.com',
            },
            license: { name: 'Proprietary', url: 'https://sfeci.com/terms' },
        },
        servers: [
            { url: '/api/v1', description: 'Current environment' },
            { url: 'http://localhost:3001/api/v1', description: 'Direct dev access' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT access token from /auth/login',
                },
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'access_token',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        first_name: { type: 'string' },
                        last_name: { type: 'string' },
                        role: { type: 'string', enum: ['buyer', 'vendor', 'compliance_officer', 'super_admin'] },
                        is_email_verified: { type: 'boolean' },
                        two_fa_enabled: { type: 'boolean' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                RFQ: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        rfq_number: { type: 'string', example: 'RFQ-2026-000001' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        sector: { type: 'string', enum: ['industrial', 'energy', 'medical', 'trading', 'tech', 'mega_projects', 'general'] },
                        status: { type: 'string', enum: ['draft', 'submitted', 'notified', 'quoted', 'comparing', 'selected', 'order_created', 'cancelled', 'expired'] },
                        sla_deadline: { type: 'string', format: 'date-time' },
                        ai_category: { type: 'string' },
                        ai_category_confidence: { type: 'number' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Vendor: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        company_name: { type: 'string' },
                        country: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'documents_submitted', 'risk_scored', 'board_review', 'approved', 'rejected', 'suspended'] },
                        risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        risk_score: { type: 'number' },
                        aml_cleared: { type: 'boolean' },
                    },
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        order_number: { type: 'string', example: 'ORD-2026-000001' },
                        status: { type: 'string', enum: ['pending', 'payment_initiated', 'escrow_held', 'fulfillment', 'delivered', 'disputed', 'settled', 'closed'] },
                        total_amount: { type: 'number' },
                        currency: { type: 'string' },
                    },
                },
                Dispute: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        dispute_number: { type: 'string', example: 'DSP-2026-000001' },
                        status: { type: 'string' },
                        reason: { type: 'string' },
                        description: { type: 'string' },
                        sla_deadline: { type: 'string', format: 'date-time' },
                    },
                },
                ApiError: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string' },
                        details: { type: 'array', items: { type: 'object' } },
                    },
                },
                ApiSuccess: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string' },
                        data: { type: 'object' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth', description: 'Authentication and session management' },
            { name: 'RFQ', description: 'Request for Quotation lifecycle' },
            { name: 'Vendors', description: 'Vendor onboarding and management' },
            { name: 'Trade', description: 'Orders, payments, and trade execution' },
            { name: 'Disputes', description: 'Dispute resolution workflow' },
            { name: 'Health', description: 'Platform health and diagnostics' },
        ],
    },
    apis: [
        './src/routes/*.js',
        './src/controllers/*.js',
    ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
