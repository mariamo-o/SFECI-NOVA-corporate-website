# NOVA Platform — B2B Trade Infrastructure Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-≥18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Containerized-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/Status-Phase%202%20Complete-brightgreen?style=for-the-badge" />
</p>

> **NOVA** is the production-ready B2B trade infrastructure backend for the **SFECI** (Société Française d'Exportation et de Commerce International) platform. It provides a secure, AI-governed, and fully audited RESTful API that powers the full lifecycle of international trade — from vendor onboarding and AML/KYC verification to Request-for-Quotation workflows, order management, dispute resolution, and automated notifications.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1 — Core Features](#phase-1--core-features)
4. [Phase 2 — Production-Readiness Upgrades](#phase-2--production-readiness-upgrades)
5. [API Reference](#api-reference)
6. [Environment Variables](#environment-variables)
7. [Database Schema](#database-schema)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Project Structure](#project-structure)
11. [Security](#security)

---

## Quick Start

### Prerequisites
- Node.js ≥ 18.0.0
- PostgreSQL 15+
- Docker & Docker Compose (recommended)

### Local Development (Docker Compose)

```bash
# 1. Clone and navigate to the project
cd nova-backend

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 3. Start all services (API + PostgreSQL + Nginx)
docker-compose up -d

# 4. Run database migrations and seed data
npm run migrate
npm run seed

# 5. The API is now live at:
#    http://localhost:4000/api/v1
#    http://localhost/api/v1  (via Nginx reverse proxy)
#    http://localhost/api-docs  (Swagger UI)
```

### Local Development (Node.js only)

```bash
npm install
npm run migrate
npm run dev
```

---

## Architecture Overview

```
nova-backend/
├── src/
│   ├── config/       # Environment, DB, Logger, Swagger config
│   ├── controllers/  # Route handlers (auth, rfq, vendor, dispute)
│   ├── middleware/   # Auth (JWT), Security (Helmet, CORS, rate limit), Error handling
│   ├── routes/       # Express router definitions
│   ├── services/     # Business logic, state machines, integrations
│   └── server.js     # Express app entry point + CRON jobs
├── src/db/
│   ├── migrations/   # Knex database schema migrations
│   └── seeds/        # Sample/test data seeders
├── tests/            # Jest unit & integration test suites
├── .github/workflows # CI/CD pipeline (GitHub Actions)
├── Dockerfile        # Production container image
├── docker-compose.yml # Full-stack local environment
└── nginx.conf        # Reverse proxy + TLS termination
```

**Technology Stack:**

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 LTS |
| Web Framework | Express 4.18 |
| Database | PostgreSQL 15 via Knex.js ORM |
| Authentication | JWT (access + refresh tokens) via httpOnly cookies |
| Password Hashing | bcryptjs (12 rounds) |
| Validation | express-validator |
| Email | Nodemailer (SMTP / AWS SES) |
| Payments | Stripe API |
| API Docs | swagger-jsdoc + swagger-ui-express |
| Logging | Winston + winston-daily-rotate-file |
| Testing | Jest + Supertest |
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Nginx (TLS + rate limiting) |
| CI/CD | GitHub Actions |
| Task Scheduling | node-cron |

---

## Phase 1 — Core Features

Phase 1 established the foundational B2B trade platform with secure authentication, vendor management, and core RFQ workflows.

### 🔐 Authentication System
- **JWT-based auth** with short-lived access tokens (15 min) and long-lived refresh tokens (7 days)
- Tokens stored in **httpOnly, Secure, SameSite=Strict cookies** (XSS-safe, CSRF-resistant)
- **User registration** with strong password policy: 8+ characters, uppercase, number, and special character required
- **Secure login** with last-login timestamp tracking and brute-force protection
- **Logout** with cookie clearing
- **Password change** with re-authentication enforcement (forces new login)
- **Password reset** via email token (1-hour expiry, enumeration-safe responses)
- User roles: `buyer`, `vendor`, `super_admin`, `compliance_officer`
- Auto-verified emails in test environment

### 🏢 Vendor Management
- Vendor **profile creation and update** with company details, sectors, and contact info
- Multi-sector support: `industrial`, `energy`, `medical`, `trading`, `tech`, `mega_projects`, `general`
- **Vendor approval workflow** with status lifecycle: `pending → under_review → risk_scored → board_review → approved / rejected`
- Document upload support (registration certificates, VAT records, etc.)
- Vendor risk scoring with `vendor_risk_scores` table

### 📋 RFQ (Request for Quotation) Lifecycle
- Create RFQs with line items (name, quantity, unit, HS code, target price)
- Auto-generated RFQ numbers (`RFQ-YYYY-000001` format)
- **State machine-driven transitions**: `draft → submitted → notified → quoted → comparing → selected → ordered → completed / cancelled / expired`
- SLA deadline enforcement (configurable via `RFQ_SLA_HOURS`)
- 7-day default quote window for vendors
- **Quote submission** by approved vendors (one quote per vendor per RFQ)
- **Quote selection** by buyer (auto-rejects competing quotes)
- State history logging in `rfq_state_log` table
- Role-based data visibility (buyers see own RFQs, vendors see matching sector RFQs)

### 🛒 Trade Orders & Payments
- Order creation from selected RFQ quotes
- Order status tracking: `pending → confirmed → processing → shipped → delivered → completed → disputed / cancelled`
- **Stripe payment integration** for order settlements
- Auto-generated order numbers (`ORD-YYYY-000001` format)
- Full audit trail for all order events

### 🗄️ Database Design
- 6 migration files creating a normalized PostgreSQL schema:
  - `001_users_and_auth.js`: Users, credentials, 2FA, password reset tokens
  - `002_vendors.js`: Vendors, risk scoring, AML/sanction fields
  - `003_products.js`: Product catalog
  - `004_rfqs.js`: RFQs, line items, quotes, state logs, AI categorization fields
  - `005_orders_payments.js`: Orders and payment records
  - `006_disputes.js`: Disputes, evidence, state logs

### 🛡️ Security Foundations
- **Helmet.js** HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS** with strict origin whitelist
- **API rate limiting** with express-rate-limit
- **Request body size limits** (2MB cap)
- **Input validation and sanitization** on every endpoint
- **Audit logging** for all critical operations

---

## Phase 2 — Production-Readiness Upgrades

Phase 2 transforms NOVA from a prototype into an enterprise-grade, AI-governed, and compliance-ready B2B infrastructure platform.

### 📧 Email Notification System
Powered by **Nodemailer** with production-ready SMTP/AWS SES transport and automatic fallback to Ethereal for development.

**Email types implemented:**
| Trigger | Recipients | Template |
|---|---|---|
| Account registration | Buyer/Vendor | Welcome + role-based onboarding |
| Password reset request | User | Secure one-time reset link (1hr expiry) |
| RFQ submission | Buyer | RFQ number, sector, SLA deadline |
| New matching RFQ | Vendor | RFQ details, sector, quote deadline |
| Quote received | Buyer | Vendor name, quote amount, comparison prompt |
| Dispute opened | Both parties | Dispute number, order ID, reason, 72hr SLA |
| KYC/AML status change | Vendor | Status (approved/rejected/under review) |

All emails use a **branded HTML template** with SFECI NOVA styling (navy gradient header, gold accents, responsive layout).

### 🤖 AI-Powered RFQ Categorization
- **AI Categorizer service** (`aiCategorizer.js`) auto-classifies RFQ sector from title and description
- Attaches `ai_category` and `ai_category_confidence` to every RFQ record
- Buyer-specified sectors override AI suggestion; AI result is always stored for analytics
- Model metadata tracked in RFQ `metadata` field

### ⚖️ Dispute Resolution Workflow
Full SLA-governed dispute lifecycle with a state machine, evidence management, and automatic escalation.

**Dispute status flow:**
```
opened → evidence_collection → under_review → resolved / escalated / closed
```

**Features:**
- Disputes automatically **lock the associated order** (`status: 'disputed'`)
- SLA deadline enforced (configurable `DISPUTE_SLA_HOURS`, typically 72h)
- **Evidence submission** with file uploads (documents, images, contracts)
- Dispute **assignment to specific resolvers** by admins
- **Role-based access control**: Only order parties or admins can view/act on disputes
- **Auto-escalation CRON job** (every 30 min): escalates overdue disputes automatically
- Full `dispute_state_log` audit trail

**Dispute reasons supported:** `non_delivery`, `quality_issue`, `wrong_item`, `payment_dispute`, `breach_of_contract`, `delivery_delay`, `other`

### 🔍 AML/KYC Integration
Multi-provider identity and compliance verification with intelligent fallback.

**Supported providers:**
| Provider | Config | Use Case |
|---|---|---|
| Jumio | `KYC_PROVIDER=jumio` | Document verification (passport, ID) |
| Onfido | `KYC_PROVIDER=onfido` | EU-compliant identity checks |
| Internal (default) | `KYC_PROVIDER=internal` | Rule-based scoring; no external API needed |

**Internal KYC scoring logic:**
- Sanctions screening against OFAC/EU lists (KP, IR, SY, CU, VE → automatic rejection)
- High-risk country detection (RU, BY, MM, SD, etc. → reduced score)
- Document completeness scoring (registration number + VAT number)
- Results saved to `vendor_risk_scores` table
- Vendor status automatically updated based on result
- **KYC webhook endpoint** at `POST /webhooks/:provider` for async callbacks from Jumio/Onfido
- KYC status email notification to vendor upon completion

### 📖 OpenAPI / Swagger Documentation
- Auto-generated API documentation using **swagger-jsdoc**
- Interactive Swagger UI at **`/api-docs`** (disabled in production by default)
- Raw OpenAPI JSON spec at `/api-docs.json`
- Enabled in production via `SWAGGER_ENABLED=true` env var
- Custom branded UI (SFECI NOVA navy gradient)

### 🔒 HTTPS / TLS Enforcement (Nginx)
- **Nginx** acts as a reverse proxy with TLS termination
- HTTP → HTTPS redirect enforced (301)
- **HSTS** (Strict-Transport-Security) header with 1-year max-age + `includeSubDomains`
- TLS 1.2/1.3 only; weak ciphers disabled
- SSL session cache and tickets configured for performance
- `nginx.conf` provided with recommended production settings
- Configure paths: `/etc/letsencrypt/live/yourdomain.com/{fullchain,privkey}.pem`

### 🔑 Secrets & Environment Management
- All secrets managed via **environment variables** (`.env` file for local dev)
- `.env.example` template provided with all required variables and documentation
- Separate `.env` configurations per environment (`development`, `test`, `production`)
- **`docker-compose.yml`** injects environment variables at container runtime
- Ready for integration with **AWS Secrets Manager**, **HashiCorp Vault**, or **GCP Secret Manager**
- No secrets committed to source control (`.gitignore` covers `.env`)

### 🧪 Comprehensive Test Suite
Testing powered by **Jest + Supertest** with full CI integration.

| Test File | Coverage |
|---|---|
| `tests/auth.test.js` | Registration, login, logout, password reset, JWT tokens |
| `tests/rfq.test.js` | RFQ create, submit, quote, select, state machine transitions |
| `tests/vendor.test.js` | Vendor profile CRUD, KYC initiation |
| `tests/security.test.js` | Rate limiting, auth guards, input validation, CORS |
| `tests/integration/` | End-to-end flows (full RFQ → order → dispute cycles) |

**Run tests:**
```bash
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:coverage       # With coverage report
npm run test:auth           # Auth module only
npm run test:rfq            # RFQ module only
```

### ⚙️ Automated CRON Jobs
| Schedule | Job | Action |
|---|---|---|
| Every hour | RFQ SLA Monitor | Expire stale RFQs, flag SLA breaches |
| Every 30 min | Dispute Escalation | Auto-escalate overdue unresolved disputes |

### 🚀 CI/CD Pipeline (GitHub Actions)
- Automated pipeline at `.github/workflows/`
- Stages: **lint → test → build → deploy**
- Runs on every push to `main` and on pull requests
- Coverage reports generated and archived

---

## API Reference

### Base URL
```
http://localhost:4000/api/v1
```

### Authentication Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login | No |
| POST | `/auth/logout` | Logout | Yes |
| GET | `/auth/me` | Get current user profile | Yes |
| POST | `/auth/change-password` | Change password | Yes |
| POST | `/auth/forgot-password` | Request password reset email | No |
| POST | `/auth/reset-password` | Confirm password reset with token | No |

### Vendor Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/vendors` | Register vendor profile | Yes (vendor) |
| GET | `/vendors` | List vendors | Yes (admin) |
| GET | `/vendors/:id` | Get vendor by ID | Yes |
| PUT | `/vendors/:id` | Update vendor | Yes (owner/admin) |
| POST | `/vendors/:id/kyc` | Initiate KYC/AML check | Yes (admin) |

### RFQ Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/rfqs` | Create new RFQ | Yes (buyer) |
| GET | `/rfqs` | List RFQs (role-filtered) | Yes |
| GET | `/rfqs/:id` | Get RFQ with items, quotes, log | Yes |
| POST | `/rfqs/:id/submit` | Submit RFQ (draft → submitted) | Yes (buyer) |
| POST | `/rfqs/:id/quotes` | Submit quote for RFQ | Yes (vendor) |
| POST | `/rfqs/:id/quotes/:quoteId/select` | Select a quote | Yes (buyer) |
| GET | `/rfqs/:id/state-log` | Get state transition history | Yes |

### Trade Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/trade/orders` | Create order from selected quote | Yes (buyer) |
| GET | `/trade/orders` | List orders | Yes |
| GET | `/trade/orders/:id` | Get order details | Yes |
| PATCH | `/trade/orders/:id/status` | Update order status | Yes |
| POST | `/trade/orders/:id/pay` | Initiate Stripe payment | Yes (buyer) |

### Dispute Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | `/trade/disputes` | Open a dispute | Yes |
| GET | `/trade/disputes` | List disputes | Yes |
| GET | `/trade/disputes/:id` | Get dispute details | Yes |
| POST | `/trade/disputes/:id/transition` | Transition dispute status | Yes (admin) |
| POST | `/trade/disputes/:id/assign` | Assign to resolver | Yes (admin) |
| POST | `/trade/disputes/:id/evidence` | Submit evidence file | Yes |

### System Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/health` | Health check (DB connectivity) | No |
| GET | `/api-docs` | Swagger UI | No (dev) |
| GET | `/api-docs.json` | OpenAPI JSON spec | No (dev) |
| POST | `/webhooks/:provider` | KYC webhook (Jumio/Onfido) | No (signed) |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Application
NODE_ENV=development
PORT=4000
API_VERSION=v1
FRONTEND_URL=http://localhost:3000

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nova_db
DB_USER=nova_user
DB_PASSWORD=your_db_password

# JWT Secrets (use strong random strings, min 32 chars)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Cookie Security
COOKIE_SECRET=your-cookie-signing-secret

# Email (SMTP or AWS SES)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_email_password
EMAIL_FROM=noreply@sfeci.com

# Stripe Payments
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# KYC/AML Provider
KYC_PROVIDER=internal          # 'jumio' | 'onfido' | 'internal'
KYC_API_KEY=                   # Required for Jumio/Onfido
KYC_API_SECRET=                # Required for Jumio
KYC_DATACENTER=EU              # Jumio datacenter

# Governance SLA
RFQ_SLA_HOURS=48
DISPUTE_SLA_HOURS=72

# API Docs
SWAGGER_ENABLED=false          # Set to true to expose in production
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|---|---|
| `users` | Accounts, roles, 2FA, password reset tokens |
| `vendors` | Vendor profiles, AML cleared status, sector arrays |
| `vendor_risk_scores` | KYC/AML scoring history per vendor |
| `products` | Product catalog linked to vendors |
| `rfqs` | RFQ records, budget, AI category, SLA deadline |
| `rfq_items` | Line items per RFQ (with HS codes) |
| `rfq_quotes` | Vendor-submitted quotes per RFQ |
| `rfq_state_log` | Complete RFQ state transition history |
| `orders` | Trade orders linked to selected quotes |
| `payments` | Stripe payment records per order |
| `disputes` | Active disputes with SLA and resolution fields |
| `dispute_evidence` | File uploads and documents per dispute |
| `dispute_state_log` | Dispute status transition history |

---

## Testing

### Setup
Tests use an isolated test database. Set `NODE_ENV=test` and configure `TEST_DB_*` variables or use Docker:

```bash
# Start test DB
docker-compose up -d postgres

# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Test Architecture
- Each test file cleans its own test data via `afterEach` / `afterAll`
- `tests/setup.js` handles global Jest configuration
- Integration tests in `tests/integration/` test full request-response cycles over HTTP
- Security tests verify rate limiting, auth guards, and CORS behavior

---

## Deployment

### Docker Compose (Recommended)
```bash
# Production deployment
NODE_ENV=production docker-compose up -d

# View logs
docker-compose logs -f nova-api

# Run migrations in container
docker-compose exec nova-api npm run migrate
```

### Nginx TLS Configuration
1. Obtain SSL certificate (Let's Encrypt / Certbot):
   ```bash
   certbot certonly --standalone -d yourdomain.com
   ```

2. Update `nginx.conf` with your domain:
   ```nginx
   server_name yourdomain.com www.yourdomain.com;
   ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
   ```

3. Start Nginx:
   ```bash
   docker-compose up -d nginx
   ```

---

## Project Structure

```
nova-backend/
├── src/
│   ├── config/
│   │   ├── env.js              # Centralized config from environment
│   │   ├── database.js         # Knex connection pool + health check
│   │   ├── logger.js           # Winston logger with audit log support
│   │   └── swagger.js          # OpenAPI spec configuration
│   ├── controllers/
│   │   ├── auth.controller.js  # Registration, login, password management
│   │   ├── rfq.controller.js   # Full RFQ + quote lifecycle
│   │   ├── vendor.controller.js# Vendor CRUD + KYC initiation
│   │   └── dispute.controller.js# Dispute open/transition/evidence
│   ├── middleware/
│   │   ├── auth.js             # JWT verification, cookie handling
│   │   ├── security.js         # Helmet, rate limiter, CORS, request logger
│   │   └── errorHandler.js     # Global error handler + asyncHandler wrapper
│   ├── routes/
│   │   ├── auth.routes.js      # /api/v1/auth/*
│   │   ├── vendor.routes.js    # /api/v1/vendors/*
│   │   ├── rfq.routes.js       # /api/v1/rfqs/*
│   │   ├── trade.routes.js     # /api/v1/trade/*
│   │   └── dispute.routes.js   # /api/v1/trade/disputes/*
│   ├── services/
│   │   ├── rfqStateMachine.js  # RFQ state transitions + SLA monitoring
│   │   ├── disputeStateMachine.js # Dispute transitions + auto-escalation
│   │   ├── amlKyc.service.js   # Jumio/Onfido/internal KYC adapter
│   │   ├── email.service.js    # Nodemailer + branded HTML templates
│   │   ├── payment.service.js  # Stripe payment processing
│   │   ├── vendorRisk.js       # Risk scoring algorithms
│   │   └── aiCategorizer.js    # AI-powered RFQ sector classification
│   ├── db/
│   │   ├── knexfile.js         # Knex environment configuration
│   │   ├── migrations/         # 6 schema migration files
│   │   └── seeds/              # Sample data seeders
│   └── server.js               # Express app, middleware chain, CRON jobs, startup
├── tests/
│   ├── auth.test.js
│   ├── rfq.test.js
│   ├── vendor.test.js
│   ├── security.test.js
│   ├── setup.js
│   └── integration/
├── .github/workflows/          # GitHub Actions CI/CD
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── GITHUB_GUIDE.md             # Step-by-step GitHub push guide
└── .env.example
```

---

## Security

### Security Controls Implemented

| Control | Implementation |
|---|---|
| Authentication | JWT httpOnly cookies, short-lived access tokens |
| Session Security | Refresh token rotation, forced re-auth on password change |
| Password Policy | Min 8 chars, uppercase + number + special char |
| Transport Security | HTTPS/TLS 1.2/1.3 via Nginx, HSTS enforced |
| HTTP Headers | Helmet.js (CSP, X-Frame-Options, etc.) |
| Rate Limiting | express-rate-limit per IP |
| Input Validation | express-validator on all inputs |
| CORS | Strict origin whitelist |
| SQL Injection | Parameterized queries via Knex.js ORM |
| Audit Logging | All user actions logged to `audit.log` |
| Secrets | Environment variables only, never in source code |
| Compliance | AML sanctions screening, KYC identity verification |

### Reporting Security Issues
Contact: **security@sfeci.com**

---

## License

Proprietary — SFECI © 2026. All rights reserved. 
Registered in France | 15 Avenue des Champs-Élysées, 75008 Paris

---

## Phase 3 — AI Governance, Analytics & Enterprise Readiness

Phase 3 completes the 14-category enterprise requirement spec, implementing full AI governance, analytics pipeline, escrow framework, multi-tenancy, and production observability.

### 🛍️ Product & Catalog Engine
Full product lifecycle for vendor catalogs:
- **CRUD for products** with SKU uniqueness enforcement per vendor
- **Vendor RBAC**: vendors manage their own products, admins manage all, buyers read published only
- **Inventory sync** endpoint with `quantity_available`, `minimum_order_quantity`, `is_in_stock`, and `lead_time_days`
- **Publish/unpublish** toggle with compliance verification fields
- **25 product categories** across 5 sectors (energy, industrial, medical, trading, mega_projects)
- Filters: `sector`, `category_id`, `vendor_id`, `is_published`, `search`
- **Routes**: `GET/POST /api/v1/products`, `GET/PUT/DELETE /api/v1/products/:id`, `POST /api/v1/products/:id/publish`, `PUT /api/v1/products/:id/inventory`, `GET /api/v1/products/categories`

### 🧾 Invoice Lifecycle
Complete invoice generation and management:
- **Auto-generate invoices from orders** with line items from quote data
- Auto-numbered invoice format: `INV-YYYY-000001`
- Tax rate configuration (default 20% VAT)
- **Overdue detection** via daily CRON job (marks `issued → overdue` when past due_date)
- **Credit notes** with validation (cannot exceed invoice total, only on issued/paid invoices)
- Status flow: `draft → issued → paid / overdue / cancelled`
- **Routes**: `POST /api/v1/invoices`, `GET /api/v1/invoices`, `GET /api/v1/invoices/:id`, `PATCH /api/v1/invoices/:id/status`, `POST /api/v1/invoices/:id/credit-note`

### 📊 Analytics & Trade Intelligence
Event-driven analytics pipeline for operational intelligence:
- **Event emission** (`platform_events` table) hooked into RFQ, order, dispute, and vendor state transitions
- **Vendor performance**: response rate, win rate, SLA compliance rate, average response time, GMV contribution
- **Buyer analytics**: RFQ frequency, orders placed, total spend, average deal size, top sectors
- **RFQ conversion funnel**: stage-by-stage rates (draft→submitted→quoted→selected→order)
- **Platform GMV**: grouped by day/week/month or sector with order count and average order value
- **Sector trends**: 30-day vs prior 30-day growth, rising/stable/declining classification
- **Routes**: `GET /api/v1/analytics/vendors/:id`, `/analytics/buyers/:id`, `/analytics/rfqs`, `/analytics/revenue`, `/analytics/trends`

### 🤖 AI Governance Framework
Complete AI operational oversight system targeting ~80% autonomous operations:
- **Decision logging**: every AI call logged to `ai_decisions` table with model version, confidence score, input, output
- **Confidence threshold enforcement**: decisions below 0.75 automatically create escalation tickets
- **Human override**: admins can override any AI decision with reason and corrected output; resolves open escalations
- **Escalation SLA**: unresolved escalations past 24h are flagged as `sla_breach: true` (CRON every 30 min)
- **Explainability reports**: full breakdown of any AI decision including inputs, outputs, confidence, and override history
- **Bias monitoring**: distribution analysis by decision type, override rates, SLA breach rates
- **aiCategorizer.js integrated**: logs categorization decisions automatically
- **Routes**: `GET /api/v1/ai/decisions`, `GET /api/v1/ai/decisions/:id`, `POST /api/v1/ai/decisions/:id/override`, `GET /api/v1/ai/escalations`, `GET /api/v1/ai/stats`

### 💰 Escrow & Settlement Framework
Structured escrow lifecycle aligned with international trade requirements:
- **Lifecycle**: `pending → funded → released / refunded / disputed`
- **T+2 default settlement** cycle (configurable T1/T2/T3) scheduled on escrow initiation
- **Stripe Connect integration points** annotated in comments for live fund holds/releases
- **Reconciliation reports**: period-based reporting of settled, refunded, and disputed totals
- **Cashflow projection**: vendor-specific expected inflows over configurable horizon (days)
- Schema: `escrow_accounts`, `settlement_cycles`, `reconciliation_reports`

### 🔐 Two-Factor Authentication
TOTP-based 2FA with full account recovery:
- **speakeasy RFC 6238** TOTP (Google Authenticator / Authy compatible)
- Setup flow: generate QR code → scan → verify token → enable (3-step confirmation)
- **10 backup codes** generated on enable; SHA-256 hashed, one-time use
- Backup code regeneration endpoint (invalidates all previous codes)
- **Routes**: `POST /auth/2fa/setup`, `POST /auth/2fa/verify`, `POST /auth/2fa/disable`, `POST /auth/2fa/backup-codes`

### 🏢 Multi-Tenancy Architecture
Brand and entity isolation for multi-company deployments:
- **Tenants table** with plan tiers (starter/growth/enterprise), domain, subdomain, brand settings
- **Default SFECI tenant** pre-seeded (`00000000-0000-0000-0000-000000000001`)
- **Tenant resolution**: `X-Tenant-ID` header → subdomain → default (falls back gracefully)
- `tenant_id` FK added to all core entity tables (`users`, `vendors`, `rfqs`, `orders`, `disputes`, `products`, `invoices`)
- Existing data backfilled to default tenant in migration
- Middleware rejects unknown/inactive tenant IDs with 401

### 📈 Prometheus Observability
Production-grade metrics for k8s/cloud deployments:
- **`GET /metrics`** — Prometheus format: HTTP request counter by method/route/status, latency histogram (10ms–5s buckets), error rate counter, plus default Node.js metrics (CPU, memory, GC, event loop)
- **`GET /health/detailed`** — structured JSON checking DB connectivity, Stripe reachability, email configuration
- **`GET /readiness`** — k8s readiness probe (200 when DB available)
- No authentication required on these endpoints (firewall-controlled in production)

### 🌱 Marketplace Liquidity Seed
Baseline catalog for cold-start liquidity:
- **25 product categories** (5 per sector: energy, industrial, medical, trading, mega_projects)
- **15 vendor profiles** (3 per sector with realistic country assignments)
- **150 products** (10 per vendor, published, with inventory)
- All seed entities flagged `is_seed_data: true` in `metadata` for easy cleanup
- Run: `npm run seed`

### ⚙️ Updated CRON Jobs

| Schedule | Job | Action |
|---|---|---|
| Every hour | RFQ SLA Monitor | Expire stale RFQs, flag SLA breaches |
| Every 30 min | Dispute Escalation | Auto-escalate overdue disputes |
| Daily (midnight) | Invoice Overdue | Mark issued invoices past due_date as overdue |
| Every 30 min | AI Governance SLA | Flag AI escalations past 24h SLA as breach |

---

## Production Readiness Checklist

### 1️⃣ Backend Infrastructure
- [x] Node.js/Express production API
- [x] PostgreSQL with Knex.js ORM (full CRUD, transactions)
- [x] Real order processing engine with state machine
- [x] HTTP status handling + structured error responses
- [x] Dev/Staging/Production environment separation via `NODE_ENV`

### 2️⃣ Security Architecture
- [x] JWT + httpOnly cookie authentication
- [x] Role-Based Access Control (RBAC) — 5 roles
- [x] OWASP Top 10: Helmet, CORS, rate limiting, input validation, parameterized queries
- [x] CSRF protection via signed cookies
- [x] HTTPS/TLS via Nginx (TLS 1.2/1.3 only)
- [x] Two-Factor Authentication (TOTP + backup codes)
- [ ] WAF integration (CloudFlare / AWS WAF — infrastructure layer)
- [ ] Penetration testing (external engagement required)

### 3️⃣ Data Architecture
- [x] Normalized relational schema (11 migration files)
- [x] Event-driven analytics pipeline (`platform_events` table)
- [x] Multi-tenancy with `tenant_id` isolation
- [ ] Encryption at rest (PostgreSQL + OS-level — infrastructure layer)
- [ ] Data versioning / event sourcing (Phase 4)

### 4️⃣ Core Marketplace Engine
- [x] Vendor onboarding with board approval workflow
- [x] Product catalog with SKU, inventory, compliance fields
- [x] RFQ lifecycle (full state machine, SLA)
- [x] Trade lifecycle: orders, invoices, disputes, credit notes
- [ ] Contract archiving (Phase 4 — document management integration)

### 5️⃣ Payment & Escrow
- [x] Stripe payment integration
- [x] Escrow framework: initiate / fund / release / refund
- [x] T+1/T+2/T+3 settlement cycles
- [x] Reconciliation reports
- [ ] Stripe Connect live fund capture (requires Stripe Connect account)

### 6️⃣ Marketplace Liquidity
- [x] Cold-start seed data: 25 categories, 15 vendors, 150 products
- [x] Sector-based RFQ routing for vendor matching
- [ ] Demand/supply balancing automation (Phase 4 ML)

### 7️⃣ API Strategy
- [x] Versioned API (`/api/v1/`)
- [x] Swagger/OpenAPI documentation at `/api-docs`
- [ ] Developer portal (Phase 4)
- [ ] Public API rate tiers

### 8️⃣ Analytics & Trade Intelligence
- [x] Event pipeline (`platform_events`)
- [x] Vendor performance analytics
- [x] Buyer behavior analytics
- [x] RFQ conversion funnel
- [x] Platform GMV with grouping
- [x] Sector trend detection

### 9️⃣ AI Governance
- [x] AI decision logging with model version + confidence
- [x] Confidence threshold enforcement (0.75 default)
- [x] Human override with audit trail
- [x] Escalation SLA monitoring (24h)
- [x] Explainability reports
- [x] Bias distribution monitoring

### 🔟 SLA & Operational Targets
- [x] RFQ SLA: 48h configured (`RFQ_SLA_HOURS`)
- [x] Dispute SLA: 72h configured (`DISPUTE_SLA_HOURS`)
- [x] AI escalation SLA: 24h (`AI_ESCALATION_SLA_HOURS`)
- [ ] Uptime SLA: target 99.9% — requires load balancer + monitoring (infrastructure)

### 1️⃣1️⃣ Multi-Entity & Multi-Brand
- [x] Tenants table with plan tiers
- [x] Tenant_id isolation on all core tables
- [x] Tenant resolution middleware (header + subdomain)

### 1️⃣2️⃣ Governance Board
- [x] `board_approvals` table with 5-day SLA
- [x] Vendor board approval workflow
- [ ] Governance dashboard UI (frontend Phase 4)

### 1️⃣3️⃣ Cloud-Native & Observability
- [x] Docker + Docker Compose
- [x] GitHub Actions CI/CD (lint → test → build → deploy)
- [x] Prometheus `/metrics` endpoint
- [x] Detailed health check `/health/detailed`
- [x] k8s readiness probe `/readiness`
- [x] Nginx zero-downtime proxy
- [ ] Auto-scaling config (k8s HPA — infrastructure layer)
- [ ] Distributed tracing (OpenTelemetry — Phase 4)

### 1️⃣4️⃣ Final Readiness
- [x] All 11 migrations applied
- [x] Seed data for liquidity baseline
- [x] README documentation complete
- [ ] Load testing performed (k6 / Artillery)
- [ ] DR plan documented and tested
