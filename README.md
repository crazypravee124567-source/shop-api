# Shop API: Node.js + Express + PostgreSQL (deployment practice project)

A small e-commerce backend with the pieces real deployments need: JWT auth, roles,
transactional orders, migrations, health check, structured logs, rate limiting,
graceful shutdown, a non-root Docker image, and a compose file with Postgres.

## Endpoints
| Method | Path | Access |
|---|---|---|
| GET | /health | public (checks DB) |
| POST | /api/auth/register, /api/auth/login | public |
| GET | /api/products, /api/products/:id | public |
| POST/PUT/DELETE | /api/products(/:id) | admin |
| POST | /api/orders | logged in (`{"items":[{"productId":1,"quantity":2}]}`) |
| GET | /api/orders | logged in (your orders) |

## Run locally (Docker)
```bash
cp .env.example .env            # then edit JWT_SECRET, ADMIN_*
export JWT_SECRET=$(openssl rand -hex 32) ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=ChangeThisPassword123
docker compose up --build
curl localhost:3000/health
```

## Run locally (no Docker)
Start any Postgres, set `DATABASE_URL` in `.env`, then:
```bash
npm install && npm run migrate && npm run dev
```

## Smoke test
```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeThisPassword123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3000/api/products -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Mug","price_cents":1200,"stock":50}'
curl localhost:3000/api/products
```

## Deployment practice paths (do them in this order)

**1. Managed PaaS + managed Postgres (easiest): Render, Railway, or Fly.io**
1. Push this folder to GitHub.
2. Create a managed Postgres instance; copy its connection string.
3. Create a web service from the repo (Docker runtime). Set env vars: `DATABASE_URL`, `JWT_SECRET`, `DB_SSL=true`, `CORS_ORIGIN` (your frontend URL), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Set the health check path to `/health`. Deploy and hit `https://<your-url>/health`.

**2. Your own VPS (teaches the most): any Ubuntu server**
1. Install Docker, copy the repo, create `.env` with real secrets, run `docker compose up -d --build`.
2. Put Caddy or Nginx in front for HTTPS (Caddy: `your.domain { reverse_proxy localhost:3000 }`).
3. Firewall: allow only 22, 80, 443. Do not expose 5432.

**3. Serverless Postgres (Neon/Supabase) + any host**: same app, just change `DATABASE_URL` and set `DB_SSL=true`.

## Production checklist to practice
- [ ] Secrets only in platform env vars, never in git
- [ ] HTTPS enabled, CORS limited to your frontend origin
- [ ] Database not publicly reachable (or restricted by IP)
- [ ] Backups: `pg_dump "$DATABASE_URL" > backup.sql`, then restore it into a fresh DB to prove it works
- [ ] Add a migration (`migrations/002_*.sql`), redeploy, and confirm it applies once
- [ ] Break something on purpose, read the logs, roll back to the previous deploy
- [ ] Add CI: build the image on every push (GitHub Actions)
- [ ] Add uptime monitoring on `/health` (UptimeRobot, Better Stack)
