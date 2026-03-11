# FeedRight — Deployment Guide

## Quick start (local Docker test)

```bash
# 1. Clone and enter repo
git clone <your-repo> && cd diet_tracker_optimizer

# 2. Create env file (edit with real passwords before going public)
cp .env.production.example .env

# 3. Build and start everything
docker compose up --build

# 4. Open http://localhost:3000
```

---

## Deploying for family & friends (recommended: cheap VPS)

### Option A — VPS (DigitalOcean / Hetzner / Linode) ~$6/mo

Best when you want full control and a custom domain.

**1. Create a $6/mo Ubuntu VPS and SSH in**

**2. Install Docker**
```bash
curl -fsSL https://get.docker.com | sh
```

**3. Copy files to server**
```bash
# On your local machine:
git push origin main

# On server:
git clone <your-repo> feedright && cd feedright
```

**4. Set up environment**
```bash
cp .env.production.example .env
nano .env   # set a real POSTGRES_PASSWORD and optionally USDA_API_KEY
```

**5. Start the stack**
```bash
docker compose up -d --build
```
App is now running on `http://<server-ip>:3000`.

**6. Add a domain + HTTPS (optional but recommended)**

Install Caddy (automatic TLS):
```bash
apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:
```
feedright.yourdomain.com {
    reverse_proxy localhost:3000
}
```
```bash
systemctl reload caddy
```
Done — HTTPS works automatically via Let's Encrypt.

---

### Option B — Railway.app (no-ops, ~$5/mo)

Best when you don't want to manage a server.

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **PostgreSQL** plugin — Railway sets `DATABASE_URL` automatically
4. Add service for the **API** (root dir, Dockerfile = `apps/api/Dockerfile`)
5. Add service for the **Web** (root dir = `apps/web`, Dockerfile = `Dockerfile`)
6. Set env vars in Railway dashboard:
   - API service: `DATABASE_URL` (from plugin), `USDA_API_KEY` (optional)
   - Web service: `NEXT_PUBLIC_API_URL=https://your-api-service.railway.app`
7. Railway generates `.railway.app` URLs — share the web URL

---

### Option C — Render.com (free tier available)

Similar to Railway. Free tier sleeps after 15 min of inactivity — fine for low traffic.

---

## Environment variables reference

| Variable | Where set | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env` | DB password — change before going public |
| `DATABASE_URL` | `.env` | Full PostgreSQL connection string |
| `USDA_API_KEY` | `.env` | Optional USDA food database key (free at fdc.nal.usda.gov) |
| `OLLAMA_BASE_URL` | `.env` | Ollama AI coach endpoint (optional) |
| `NEXT_PUBLIC_API_URL` | docker-compose / Railway | Internal URL Next.js uses to proxy API calls |

---

## Multi-user notes

- Each person creates their own **profile** in the app (no accounts/login needed for family use)
- Profiles can have an optional PIN for privacy
- All data is stored in PostgreSQL, scoped per profile
- If you later want real login/auth, add NextAuth.js or Supabase Auth

---

## Updating after code changes

```bash
# On your VPS:
git pull origin main
docker compose up -d --build
```
