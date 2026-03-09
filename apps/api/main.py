"""
NutriTrack API — FastAPI application entry point.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import create_tables, seed_food_db
from .routers import advisor, analytics, foods, logs, profiles, recommendations, saved_meals, targets, weight


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and seed initial data on startup."""
    create_tables()
    seed_food_db()
    yield


app = FastAPI(
    title="NutriTrack API",
    description="Deterministic nutrition tracking & next-food recommendation engine.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router,         prefix="/api/profiles",         tags=["profiles"])
app.include_router(foods.router,            prefix="/api/foods",            tags=["foods"])
app.include_router(logs.router,             prefix="/api/logs",             tags=["logs"])
app.include_router(targets.router,          prefix="/api/targets",          tags=["targets"])
app.include_router(saved_meals.router,      prefix="/api/saved-meals",      tags=["saved-meals"])
app.include_router(recommendations.router,  prefix="/api/recommendations",  tags=["recommendations"])
app.include_router(weight.router,           prefix="/api/weight",           tags=["weight"])
app.include_router(analytics.router,        prefix="/api/analytics",        tags=["analytics"])
app.include_router(advisor.router,          prefix="/api/advisor",          tags=["advisor"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "nutritrack-api"}
