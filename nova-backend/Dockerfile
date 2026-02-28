# ============================================================
# NOVA Platform — Dockerfile (Backend)
# Multi-stage: deps → production-slim
# Entrypoint auto-runs migrations before server start.
# ============================================================

# Stage 1: Dependencies (production only)
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Stage 2: Production image
FROM node:20-slim AS production
WORKDIR /app

# Security: run as non-root
RUN groupadd -r nova && useradd -r -g nova nova

# Copy production deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./

# Copy entrypoint script and make it executable
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create required directories and set ownership
RUN mkdir -p logs uploads && chown -R nova:nova /app

USER nova

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

# Entrypoint runs migrations, then exec's the CMD
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
