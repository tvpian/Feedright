# ─────────────────────────────────────────────────────────────────────────────
# FeedRight — API Dockerfile
# Build context: monorepo root  (docker-compose: context: .)
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System deps (psycopg2-binary needs libpq at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY apps/api/      ./apps/api/
COPY packages/      ./packages/
COPY alembic/       ./alembic/
COPY alembic.ini    ./alembic.ini

# Make both apps/ and packages/ importable (mirrors Makefile PYTHONPATH)
ENV PYTHONPATH=/app/apps:/app/packages

EXPOSE 8000

# Run DB migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn api.main:app --host 0.0.0.0 --port 8000"]
