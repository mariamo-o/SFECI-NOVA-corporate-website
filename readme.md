<div align="center">
  <img src="https://img.shields.io/badge/SFECI-NOVA_Platform-0A192F?style=for-the-badge&logo=appveyor" alt="NOVA Platform" />
  <h1>🌍 NOVA Platform — Executive Workspace</h1>
  
  <p>
    <b>A Secure, Scalable, AI-Driven International B2B & Dropshipping Trade Infrastructure</b>
  </p>

  <div>
    <img src="https://img.shields.io/badge/Status-Production_Ready-success?style=flat-square" alt="Status" />
    <img src="https://img.shields.io/badge/Stack-Node.js_|_PostgreSQL-339933?style=flat-square&logo=node.js" alt="Stack" />
    <img src="https://img.shields.io/badge/Security-OWASP_Top_10-EA2027?style=flat-square&logo=owasp" alt="Security" />
    <img src="https://img.shields.io/badge/Docker-Enabled-2496ED?style=flat-square&logo=docker" alt="Docker" />
  </div>
  <br/>
</div>

> ⚡ **Master Workspace Documentation** for deploying and operating the complete NOVA ecosystem.

This workspace contains two distinct repositories designed to run together via Docker:
1. `nova-backend/` (Node.js API + PostgreSQL)
2. `sfeci-corporate/` (Static Frontend + Nginx proxy)

---

## 🚀 Quick Start (Local Run via Docker)

The fastest way to launch the complete platform is using the bundled Docker Compose stack inside the `nova-backend` directory, which mounts both repositories.

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)
- Node.js v20+ (for local, non-Docker development only)

### Standard Boot Sequence

Open your terminal (PowerShell / Bash) and run:

```bash
# 1. Enter the backend directory where the docker-compose file lives
cd nova-backend

# 2. Start the database, backend API, and frontend proxy in background mode
docker-compose up -d

# 3. View the logs to ensure the API started successfully
docker logs -f nova_api
```

### Accessing the Platform
- **Corporate Website (Frontend):** [http://localhost](http://localhost)
- **API Base URL:** `http://localhost/api/v1`
- **System Health Dashboard:** `http://localhost/health/detailed`
- **Prometheus Metrics:** `http://localhost/metrics`

---

## 🗄️ Database Operations

The platform uses **Knex.js** for database migrations and seeding. When you boot the Docker stack for the first time, it will automatically create the database structure, but you need to run seeds to populate it with test data and liquidity baseline data.

### 1. Seeding Data (First Time Only)

To populate the database with the pre-configured 25 categories, 15 vendors, and test accounts:

```bash
# Exec into the running API container and trigger the seed command
docker-compose exec api npm run seed

# Expected output:
# "Migrating..."
# "Liquidity baseline seeded: 25 categories, 15 vendors..."
```

> **Test Accounts Created via Seed:**
> - Admin: `admin@sfeci.com` / `Admin@1234!`
> - Buyer: `buyer@acme.com` / `Buyer@1234!`
> - Vendor: `vendor@techcorp.com` / `Vendor@1234!`

### 2. Running Migrations Manually

If you pull new code that contains database changes:
```bash
docker-compose exec api npm run migrate
```

### 3. Resetting the Database (Wiping everything)

```bash
# Stop containers and DESTROY the database volume
docker-compose down -v

# Rebuild containers cleanly
docker-compose up --build -d
```

---

## ⚙️ Environment Variables & Configuration

The platform is fully configured via `.env` files. Inside the `nova-backend/` folder, copy `.env.example` to `.env` (if not already done).

### Critical Variables:

| Variable | Purpose | Default / Example |
|---|---|---|
| `JWT_ACCESS_SECRET` | Secret key for signing auth tokens | *(Generate a 32-char complex string)* |
| `STRIPE_SECRET_KEY` | API key for Escrow/Payments | `sk_test_...` |
| `CONFIDENCE_THRESHOLD` | AI score limit before human escalation | `0.75` (75%) |
| `RFQ_SLA_HOURS` | Timers for Automated State Machines | `48` |

---

## 🩺 System Observability

The platform exports real-time health and metrics data. 

To easily monitor the system while in operation, check these endpoints from your browser or monitoring tools:

- **Liveness Probe (Kubernetes):** `GET http://localhost/readiness` (Returns 200 OK)
- **Deep Health Report:** `GET http://localhost/health/detailed` (Checks Database connection, External APIs, and Storage)
- **Prometheus Metrics:** `GET http://localhost/metrics` (Outputs raw metrics for CPU, Memory, Latency, and Error rates formatted for Prometheus scraping)

---

## � Troubleshooting

| Error / Symptom | Solution |
|---|---|
| `dependency failed to start: container nova_api is unhealthy` | Usually means the PostgreSQL database didn't start fast enough or port `5432` is blocked. Check `docker logs nova_db`. |
| API returns `502 Bad Gateway` | The API container (`nova_api`) crashed. View logs with `cd nova-backend && docker logs nova_api`. |
| Migrations throw `relation already exists` | The database was partially migrated. Reset it with `docker-compose down -v` and run again. |
| Cannot Login (`401 Unauthorized`) | Ensure you have run the seed command: `docker-compose exec api npm run seed` to create the test accounts. |

---

<div align="center">
  <img src="https://img.shields.io/badge/Engineered_for-Scale-0A192F?style=for-the-badge" alt="Scale" />
  <img src="https://img.shields.io/badge/Secured_by-Design-EA2027?style=for-the-badge" alt="Secure" />
  <img src="https://img.shields.io/badge/Powered_by-AI-8A2BE2?style=for-the-badge" alt="AI" />
  
  <br/><br/>
  
  <p>
    <i>© 2026 SFECI NOVA Trade Infrastructure. All rights reserved.</i><br/>
    <i>Confidential and Proprietary. For internal/devops use only.</i>
  </p>
</div>
