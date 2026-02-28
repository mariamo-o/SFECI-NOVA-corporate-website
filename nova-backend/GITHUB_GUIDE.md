# NOVA Platform — GitHub Push Guide

## Pushing to GitHub: Step-by-Step

### Prerequisites
- [Git for Windows](https://git-scm.com/download/win) installed
- [GitHub account](https://github.com) with SSH key or Personal Access Token configured

---

## Step 1 — Create the GitHub Repository

1. Log into [github.com](https://github.com)
2. Click **New repository** (+ icon → New repository)
3. Settings:
   - **Name**: `nova-platform`
   - **Visibility**: ✅ **Private** (mandatory — contains `.env` and secrets)
   - **Initialize**: Skip (do NOT add README/gitignore via UI — we have our own)
4. Click **Create repository**
5. Copy the SSH URL: `git@github.com:<YOUR_USERNAME>/nova-platform.git`

---

## Step 2 — Create `.gitignore` (Root Level)

Create `C:\Users\20102\.gemini\antigravity\scratch\.gitignore`:

```gitignore
# Environment & secrets (NEVER commit)
.env
.env.local
.env.production
*.pem
*.key
ssl/
certs/

# Dependencies
node_modules/
**/node_modules/

# Build outputs
dist/
build/
.next/

# Logs & temp
logs/
*.log
uploads/
tmp/

# Docker
.dockerignore

# IDE
.vscode/
.idea/
*.suo
*.user

# OS
.DS_Store
Thumbs.db

# Coverage
coverage/
.nyc_output/

# Vault tokens
vault-token
```

---

## Step 3 — Initialize Git Repository

Open **PowerShell** and run:

```powershell
# Navigate to project root
cd C:\Users\20102\.gemini\antigravity\scratch

# Initialize git
git init -b main

# Add remote origin (replace with YOUR GitHub URL)
git remote add origin git@github.com:<YOUR_USERNAME>/nova-platform.git

# Verify remote
git remote -v
```

---

## Step 4 — Review What Will Be Committed

```powershell
# Check status — ensure .env is NOT listed (should be gitignored)
git status

# If .env appears, run:
git rm --cached nova-backend/.env
git rm --cached nova-backend/.env.local
```

---

## Step 5 — Stage and Commit All Files

```powershell
# Stage all files (respects .gitignore)
git add .

# Verify staged files — ensure no secrets
git status

# Create initial commit
git commit -m "feat: NOVA Platform Phase 1+2 implementation

- Node.js/Express backend with PostgreSQL (Knex ORM)
- JWT auth, RBAC, 2FA (TOTP), CSRF protection
- RFQ lifecycle engine with state machine
- Vendor onboarding with AML/KYC adapter (Jumio/Onfido/internal)
- Dispute workflow with state machine and SLA enforcement
- Email notifications (nodemailer SMTP/SES)
- Stripe escrow payment integration
- Swagger/OpenAPI documentation at /api-docs
- Docker Compose stack (nginx, api, postgres)
- Auto-migrations on container start (docker-entrypoint.sh)
- GitHub Actions CI/CD pipeline (lint, test, build, deploy)
- HashiCorp Vault secrets management adapter
- Integration tests for auth, RFQ, and disputes"
```

---

## Step 6 — Push to GitHub

```powershell
git push -u origin main
```

If using HTTPS instead of SSH:
```powershell
git remote set-url origin https://github.com/<YOUR_USERNAME>/nova-platform.git
git push -u origin main
# Enter GitHub username + Personal Access Token when prompted
```

---

## Step 7 — Create Branch Strategy

```powershell
# Create and push develop branch
git checkout -b develop
git push -u origin develop

# Create feature branch for new work
git checkout -b feature/my-feature
```

**Branch strategy:**

| Branch | Purpose |
|---|---|
| `main` | Production-ready code only |
| `develop` | Integration branch for features |
| `feature/*` | Individual feature branches |
| `hotfix/*` | Critical production fixes |

---

## Step 8 — Configure GitHub Repository Settings

In your GitHub repository → **Settings**:

### Branch Protection (main)
1. **Settings → Branches → Add rule**: `main`
2. Enable: ✅ Require PR before merging
3. Enable: ✅ Require status checks (select `Test`, `Build`)
4. Enable: ✅ Require signed commits (recommended)
5. Enable: ✅ Dismiss stale reviews

### Secrets (for CI/CD)
**Settings → Secrets and variables → Actions → New repository secret:**

| Secret Name | Value |
|---|---|
| `STAGING_HOST` | Your staging server IP/hostname |
| `STAGING_USER` | SSH username (e.g. `ubuntu`) |
| `STAGING_SSH_KEY` | Private SSH key for staging server |
| `PROD_HOST` | Production server IP/hostname |
| `PROD_USER` | SSH username |
| `PROD_SSH_KEY` | Private SSH key for production |
| `SLACK_WEBHOOK_URL` | Slack webhook for deploy notifications |

### Environment Variables (for CI test runs)
**Settings → Secrets → Actions → Variables:**

| Variable | Value |
|---|---|
| `STAGING_URL` | `https://staging.sfeci.com` |
| `PRODUCTION_URL` | `https://nova.sfeci.com` |

---

## Step 9 — Enable GitHub Actions

Actions are auto-enabled when `.github/workflows/*.yml` is pushed.

Check status at: `https://github.com/<YOUR_USERNAME>/nova-platform/actions`

CI runs automatically on:
- `git push` to `main` or `develop`
- Pull request creation

---

## Step 10 — Enable HTTPS / TLS (Production)

### Option A: Let's Encrypt (recommended)

On your server:
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d nova.sfeci.com

# Certs will be at:
# /etc/letsencrypt/live/nova.sfeci.com/fullchain.pem
# /etc/letsencrypt/live/nova.sfeci.com/privkey.pem
```

Add to `docker-compose.yml` nginx volumes:
```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
  - ./nginx.conf:/etc/nginx/nginx.conf:ro
```

Then uncomment the TLS block in `nginx.conf`.

### Option B: Self-signed (development only)

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/privkey.pem -out ssl/fullchain.pem \
  -subj "/CN=localhost/O=SFECI NOVA/C=FR"
```

---

## Step 11 — Ongoing Workflow

```powershell
# Create feature branch
git checkout -b feature/email-templates develop

# ... make changes ...

git add .
git commit -m "feat(email): add dispute resolution email template"
git push origin feature/email-templates

# Open Pull Request on GitHub:
# base: develop ← compare: feature/email-templates
```

---

## Best Practices Checklist

- [ ] `.env` is in `.gitignore` and never committed
- [ ] All secrets in GitHub Secrets, not plain text
- [ ] Branch protection rules enabled on `main`
- [ ] PR reviews required before merge
- [ ] CI must pass before merge
- [ ] Signed commits enabled (optional but recommended)
- [ ] `package-lock.json` is committed (reproducible builds)
- [ ] `node_modules/` is gitignored
- [ ] No `console.log` with sensitive data in committed code

---

*NOVA Platform — SFECI B2B Trade Infrastructure*  
*Version control: GitHub (private repository)*  
*CI/CD: GitHub Actions → GHCR → Docker Compose*
