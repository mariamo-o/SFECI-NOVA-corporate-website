#!/bin/sh
# ============================================================
# NOVA Platform — Docker Entrypoint
# Runs DB migrations (and optionally seeds) before starting
# the Node.js server using the Knex CLI binary.
# ============================================================
set -e

KNEXFILE="/app/src/db/knexfile.js"
KNEX_BIN="/app/node_modules/.bin/knex"
ENV="${NODE_ENV:-development}"

echo "======================================================"
echo "  NOVA Platform — Entrypoint"
echo "  Environment : $ENV"
echo "  DB Host     : ${DB_HOST:-localhost}"
echo "======================================================"

# ---- Run migrations via knex CLI ----
# Using the CLI binary ensures migration directory is resolved
# relative to the knexfile location (src/db/), not CWD.
echo "[entrypoint] Running Knex migrations (env: $ENV)..."
"$KNEX_BIN" migrate:latest \
  --knexfile "$KNEXFILE" \
  --env "$ENV"

echo "[entrypoint] Migrations complete."

# ---- Optionally run seeds (only when RUN_SEEDS=true) ----
if [ "${RUN_SEEDS:-false}" = "true" ]; then
  echo "[entrypoint] RUN_SEEDS=true — running seed data..."
  # Seeds may fail on re-run due to unique constraints — non-fatal
  "$KNEX_BIN" seed:run \
    --knexfile "$KNEXFILE" \
    --env "$ENV" || echo "[entrypoint] Seeds skipped (may already exist)."
  echo "[entrypoint] Seeds complete."
else
  echo "[entrypoint] RUN_SEEDS not set — skipping seeds."
fi

echo "[entrypoint] Starting NOVA API server..."
exec "$@"
