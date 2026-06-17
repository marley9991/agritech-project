# ─────────────────────────────────────────────────────────────────────────────
# AgriConnect — Multi-Stage Docker Build
# Phase 5 Deployment · GDSS AgriTech Innovation Challenge
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# ── Install backend dependencies ──────────────────────────────────────────────
COPY backend/package.json ./backend/
RUN cd backend && npm install --production

# ── Copy source files ─────────────────────────────────────────────────────────
COPY backend/server.js   ./backend/
COPY frontend/           ./frontend/
COPY schema.sql          ./

# ── Runtime environment ───────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "backend/server.js"]
