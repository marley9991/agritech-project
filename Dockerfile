# ─────────────────────────────────────────────────────────────────────────────
# AgriConnect — Docker Build (flat repo structure)
# Phase 5 Deployment · GDSS AgriTech Innovation Challenge
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl postgresql-client

# ── Install dependencies ──────────────────────────────────────────────────────
COPY package.json ./
RUN npm install --omit=dev

# ── Copy source files (flat structure — everything at repo root) ─────────────
COPY server.js              ./
COPY index.html              ./
COPY agriconnect_schema.sql  ./
COPY seed.sql                ./

# ── Runtime environment ───────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
