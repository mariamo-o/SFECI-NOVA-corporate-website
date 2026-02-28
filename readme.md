# NOVA Platform — SFECI Executive Overview

> **A Secure, Scalable, AI-Driven International B2B & Dropshipping Trade Infrastructure.**

This workspace contains the complete, production-grade source code for the NOVA Platform, consisting of two primary repositories that work seamlessly together.

| Component | Directory | Purpose | Stack |
|---|---|---|---|
| **Backend Infrastructure** | [`/nova-backend`](./nova-backend/) | The core trade engine, database, and API. | Node.js, Express, PostgreSQL 16, Knex, Docker |
| **Corporate Frontend** | [`/sfeci-corporate`](./sfeci-corporate/) | The public-facing B2B corporate website. | Vanilla HTML/JS, Nginx, Responsive CSS |

---

## 🎯 Architectural Compliance & Feature Validation

The platform has been meticulously engineered to meet the 14-point executive directive. Here is the implementation matrix confirming the platform's evolution from prototype to a governed, autonomous trade infrastructure.

### 1️⃣ Critical Launch-Blocking Deficiencies (P0) — ✅ VALIDATED
- **Production Backend:** Fully operational Node.js REST API with PostgreSQL 16.
- **Transactional Integrity:** Fully enforced via Knex ORM with full UUID-based relational models.
- **Security architecture:** JWT (access/refresh), RBAC, strict Helmet CSP/HSTS, CSRF double-submit cookies, Rate Limiting, and **Speakeasy Two-Factor Authentication (2FA)** for privileged accounts.

### 2️⃣ Data Architecture — ✅ VALIDATED
- Cross-entity data isolation enforced via **Multi-Tenancy Middleware** (`X-Tenant-ID` / Subdomains).
- Data lineage tracking built into state-machine driven migrations (Orders, RFQs, Disputes, AI Decisions).

### 3️⃣ Core Marketplace Engine — ✅ VALIDATED
- **Vendor Onboarding:** File handling (`multer`), AML/KYC abstractions, automated Risk Scoring, and Board Approvals.
- **Product & Catalog:** Fully functional sector-based category API with SKU and inventory sync.
- **RFQ Engine:** Complex state machine tracking (Request → Quotes → Select → Order).
- **Trade Lifecycle:** Quote → Contract → Stripe Escrow → Ship → Invoice Auto-generation → Settled.

### 4️⃣ Payment & Escrow Governance — ✅ VALIDATED
- State-driven escrow service abstracted for Stripe Connect (Initiate → Hold → Release/Refund).
- Auto-generation of Invoices, Credit Notes, and T+2 settlement cycles.

### 5️⃣ Marketplace Liquidity Strategy — ✅ VALIDATED
- **Seeding Baseline:** Zero cold-start. Infrastructure contains seed migrations loading **25 categories**, **15 vendors** across 5 sectors, and **150 SKUs** on first boot.

### 6️⃣ API Strategy — ✅ VALIDATED
- Versioned endpoints (`/api/v1/*`), strict OWASP rate-limiting per IP (auth vs. api routes).

### 7️⃣ Platform Analytics & Trade Intelligence — ✅ VALIDATED
- Event-driven analytics pipeline tracking vendor performance, buyer behavior, RFQ funnel metrics, and aggregated GMV revenue tracking per sector.

### 8️⃣ AI Operational Governance — ✅ VALIDATED
- Categorization engine secured with strict governance (`src/services/aiGovernance.service.js`).
- Confidence thresholds (< 0.75 triggers escalation), Explainability reporting, Human SLA Overrides, Bias monitoring reports, and full Decision Audit Logging.

### 9️⃣ SLA & Operational Targets — ✅ VALIDATED
- Automated CRON pipelines tracking RFQ SLA expiry, Dispute deadlining, AI human-override SLAs, and Overdue Invoice tagging.

### 🔟 Multi-Entity & Multi-Brand Architecture — ✅ VALIDATED
- Native architecture supports limitless parent/child entities via the `tenants` schema injection on every entity table.

### 1️⃣1️⃣ Governance Board Structure — ✅ VALIDATED
- Strict RBAC models map exactly to: `super_admin` (Platform Operator), `compliance_officer` (Reviewer), `buyer`, and `vendor`. 

### 1️⃣2️⃣ Growth Engine — 🟡 PARTIAL (Phase 4)
- Backend structured for scalability; CRM integrations and Marketing AI are plotted for Phase 4 deployment.

### 1️⃣3️⃣ Cloud-Native Architecture & Observability — ✅ VALIDATED
- Configured docker-compose stack. 
- Integrated **Prometheus Metrics** (`/metrics`), Kubernetes `/readiness` HTTP probes, and JSON-based deep `/health/detailed` endpoints.

### 1️⃣4️⃣ Production Readiness Checklist — ✅ COMPLETED
The infrastructure is ready. The remaining steps before taking this to public networks involve AWS/Cloudflare infrastructure provisioning (WAF, SSL Certs, Secrets Manager).

---

## 🚀 How to Launch the Full Stack Locally

If you have Docker Desktop installed on your machine, you can launch the entire ecosystem in one command:

```powershell
# 1. Enter the backend directory
cd ./nova-backend

# 2. Start the Docker Compose stack
docker-compose up --build -d

# 3. View the corporate website
# Open http://localhost in your browser

# 4. View Backend Health
# Open http://localhost/health/detailed
```

> 📖 *For deeper technical integration instructions, read the `README.md` file located inside the `nova-backend/` folder.*
