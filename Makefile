.PHONY: install-api run-api install-web run-web run-tests dev help

# ── Python ────────────────────────────────────────────────────────────────────
install-api:
	pip install -r apps/api/requirements.txt

run-api:
	PYTHONPATH=$(PWD)/packages:$(PWD)/apps .venv/bin/uvicorn api.main:app --reload --port 8000

# ── Node / Next.js ────────────────────────────────────────────────────────────
install-web:
	cd apps/web && npm install

run-web:
	cd apps/web && npm run dev

# ── Tests ─────────────────────────────────────────────────────────────────────
run-tests:
	python -m pytest packages/nutrition_core/tests/ -v

# ── Combined dev mode (requires tmux or two terminals) ──────────────────────
dev:
	@echo "Starting API in background..."
	@PYTHONPATH=$(PWD)/packages:$(PWD)/apps .venv/bin/uvicorn api.main:app --reload --port 8000 &
	@echo "Starting web dev server..."
	cd apps/web && npm run dev

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  make install-api   Install Python API dependencies"
	@echo "  make run-api       Start FastAPI server on :8000"
	@echo "  make install-web   Install Node.js web dependencies"
	@echo "  make run-web       Start Next.js dev server on :3000"
	@echo "  make run-tests     Run nutrition_core pytest suite"
	@echo "  make dev           Start both servers (bg API + fg web)"
	@echo ""
