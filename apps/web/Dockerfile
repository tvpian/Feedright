# ─────────────────────────────────────────────────────────────────────────────
# FeedRight — Web Dockerfile
# Build context: apps/web  (docker-compose: context: apps/web)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_API_URL is injected at runtime via docker-compose/env vars.
# The Next.js rewrite (next.config.mjs) uses it server-side to proxy
# /api/* → FastAPI container, so it does NOT need to be a public URL.
# Default empty here; override with NEXT_PUBLIC_API_URL in your environment.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built artefacts
COPY --from=builder /app/.next         ./.next
# public/ may not exist if there are no static assets
RUN mkdir -p ./public
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["npm", "start"]
