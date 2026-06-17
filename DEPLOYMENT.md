# AgriConnect — Deployment Runbook
**GDSS AgriTech Innovation Challenge · Phase 5**
Go-live: June 29, 2026

---

## Project Structure

```
agriconnect/
├── schema.sql              # Full DB schema (15 tables, 9 enums, 22 indexes)
├── seed.sql                # Demo seed data (farmers, buyers, drivers, orders)
├── .env.example            # Environment variable template
├── docker-compose.yml      # Full-stack orchestration
├── nginx.conf              # Reverse proxy + static file serving
├── Dockerfile              # API container build
├── backend/
│   ├── server.js           # Express API (Task 5.1 + 5.2)
│   ├── demo.js             # End-to-end demo script (Task 5.3)
│   └── package.json
└── frontend/
    └── index.html          # Self-contained React frontend
```

---

## Option A — Docker Compose (Recommended for Demo Day)

### Prerequisites
- Docker Desktop 24+ or Docker Engine + Compose plugin
- 2 GB RAM available
- Ports 80, 3000, 5432 free

### 1. Clone & configure
```bash
git clone https://github.com/your-team/agriconnect.git
cd agriconnect
cp .env.example .env
# Edit .env — set DB_PASSWORD and JWT_SECRET at minimum
nano .env
```

### 2. Launch full stack
```bash
docker compose up --build -d
# Builds API image, starts PostgreSQL, runs schema + seed automatically
```

### 3. Verify everything is running
```bash
docker compose ps
# Should show: agriconnect-db (healthy), agriconnect-api (healthy), agriconnect-web (running)

curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":...,"db":"connected"}

curl "http://localhost:3000/api/products?category=tomato"
# Expected: JSON array of tomato listings
```

### 4. Access the app
| Interface     | URL                          |
|---------------|------------------------------|
| Frontend      | http://localhost             |
| API           | http://localhost:3000/api    |
| Database      | localhost:5432 (agriconnect) |

### 5. Run the live demo script
```bash
docker compose exec api node backend/demo.js
# Walks through all 12 steps and prints judge-ready summary
```

---

## Option B — Manual Local Setup (No Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

```bash
# 1. Create database
createdb agriconnect
psql agriconnect -f schema.sql
psql agriconnect -f seed.sql

# 2. Install & start backend
cd backend
npm install
DATABASE_URL=postgresql://localhost/agriconnect node server.js &

# 3. Open frontend
open frontend/index.html   # or serve with:
npx serve frontend -p 8080

# 4. Run demo
DATABASE_URL=postgresql://localhost/agriconnect node demo.js
```

---

## Option C — Deploy to Cloud (Render.com — Free Tier)

Render is the fastest free-tier option for a public judge URL.

### Database (PostgreSQL)
1. Go to https://dashboard.render.com → New → PostgreSQL
2. Name: `agriconnect-db`, Plan: Free
3. Copy the **External Database URL**

### Backend API (Web Service)
1. New → Web Service → Connect your GitHub repo
2. Settings:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `node backend/server.js`
   - **Environment:**
     ```
     DATABASE_URL=<paste external db url from step above>
     NODE_ENV=production
     JWT_SECRET=<random 64 chars>
     ```
3. After first deploy, run migrations:
   - Go to Shell tab in Render dashboard
   - `psql $DATABASE_URL -f schema.sql`
   - `psql $DATABASE_URL -f seed.sql`

### Frontend (Static Site)
1. New → Static Site → same repo
2. **Publish directory:** `frontend`
3. Add environment variable: `VITE_API_URL=https://your-api.onrender.com`

### Result
- Frontend: `https://agriconnect.onrender.com`
- API:       `https://agriconnect-api.onrender.com`

---

## Option D — Vercel (Frontend) + Railway (Backend)

### Frontend → Vercel
```bash
npm i -g vercel
cd frontend
vercel --prod
# Outputs: https://agriconnect.vercel.app
```

### Backend + DB → Railway
```bash
npm i -g @railway/cli
railway login
railway init
railway add postgresql
railway up
# Set DATABASE_URL env var from Railway PostgreSQL plugin
```

---

## API Health Check Endpoint

Add this to `server.js` for the HEALTHCHECK:

```javascript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});
```

---

## Key API Endpoints for Judge Demo

| # | Method | Endpoint | What it shows |
|---|--------|----------|---------------|
| 1 | POST | `/api/users/register` | Register a farmer |
| 2 | POST | `/api/products` | Farmer lists produce |
| 3 | GET | `/api/products?category=tomato` | Buyer searches |
| 4 | POST | `/api/orders` | Buyer places order |
| 5 | POST | `/api/orders/:id/authorize-payment` | MoMo escrow |
| 6 | POST | `/api/logistics/match-driver` | 🤖 Algorithm runs |
| 7 | PATCH | `/api/logistics/trips/:id/status` | Live status updates |
| 8 | GET | `/api/logistics/trips/:id/tracking` | GPS ping history |
| 9 | POST | `/api/reviews` | Post-delivery review |

---

## Demo Day Checklist (June 29)

- [ ] Docker Compose starts cleanly (`docker compose up`)
- [ ] Seed data visible in API (`GET /api/products` returns 6 listings)
- [ ] Frontend loads at `http://localhost` or cloud URL
- [ ] Demo script runs end-to-end (`node demo.js`)
- [ ] Spoilage algorithm output visible in console
- [ ] Figma prototype link ready (Modules 1–5)
- [ ] Canva slides exported as PDF
- [ ] DB schema diagram on Figma "DB Schema & State Machine" board
- [ ] USSD simulation visible in frontend "USSD Mode" tab
- [ ] Backup: frontend HTML opens standalone (no server needed)

---

## Troubleshooting

**Port 5432 already in use:**
```bash
# Change DB port in docker-compose.yml: "5433:5432"
# Update DATABASE_URL: postgresql://...@localhost:5433/agriconnect
```

**API can't connect to DB:**
```bash
docker compose logs db        # check DB logs
docker compose restart api    # restart API after DB is healthy
```

**Frontend shows blank page:**
- Open browser DevTools → Console
- Check for CORS errors → API may not be running
- Try opening `frontend/index.html` directly (works offline)

**Demo script fails:**
```bash
# Ensure DB is seeded first
psql $DATABASE_URL -f seed.sql
# Then re-run
node backend/demo.js
```

---

## Architecture Summary

```
Browser / Mobile
      │
      ▼
 Nginx (port 80)
  ├── /          → frontend/index.html  (React SPA)
  └── /api/*     → Express API (port 3000)
                        │
                        ▼
                  PostgreSQL DB (port 5432)
                  15 tables · 9 enum types
                  22 indexes
```

**Matching Algorithm** runs server-side in `/api/logistics/match-driver`:
- Spoilage Score (0–100) from crop age × ambient temp
- Composite driver scoring: distance(40-60%) + cost(15-25%) + capacity(20%) + refrigeration(10%) + rating(5%)
- High-spoilage mode auto-boosts distance weight to 60%
