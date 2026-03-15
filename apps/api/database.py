"""
SQLAlchemy database setup + ORM models.
Uses SQLite for MVP (swap DATABASE_URL to PostgreSQL later).
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    ForeignKey,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nutritrack.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── ORM Models ────────────────────────────────────────────────────────────────

class UserDB(Base):
    __tablename__ = "users"

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name             = Column(String, nullable=False)
    age              = Column(Float, nullable=False)
    sex              = Column(String, nullable=False)
    weight_kg        = Column(Float, nullable=False)
    height_cm        = Column(Float, nullable=False)
    activity_level   = Column(String, nullable=False)
    goal_mode        = Column(String, nullable=False, default="maintenance")
    # JSON arrays stored as strings
    dietary_preferences = Column(Text, default="[]")
    avoid_foods         = Column(Text, default="[]")
    supplement_ids      = Column(Text, default="[]")
    is_active           = Column(Boolean, default=True)
    pin_hash            = Column(String, nullable=True)   # bcrypt hash; NULL = no PIN
    # ── New holistic fields ──
    health_goals        = Column(Text, default="[]")       # JSON list of HealthGoal values
    health_conditions   = Column(Text, default="[]")       # JSON list of HealthCondition values
    supplements_json    = Column(Text, default="[]")       # JSON list of {name, daily_nutrients}
    water_goal_ml       = Column(Float, nullable=True)      # Custom daily water goal; NULL = use default (2500)
    # ── Role / Coach-Client ──
    role                = Column(String, default="solo")    # "solo", "coach", "client"
    coach_id            = Column(String, ForeignKey("users.id"), nullable=True)  # if role=client


class FoodDB(Base):
    __tablename__ = "foods"

    id                 = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name               = Column(String, nullable=False, index=True)
    aliases            = Column(Text, default="[]")   # JSON list
    category           = Column(String, nullable=False)
    default_serving_g  = Column(Float, nullable=False)
    default_unit       = Column(String, nullable=False)
    tags               = Column(Text, default="[]")   # JSON list
    nutrients_json     = Column(Text, nullable=False)  # JSON dict
    is_custom          = Column(Boolean, default=False)


class SavedMealDB(Base):
    __tablename__ = "saved_meals"

    id       = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id  = Column(String, ForeignKey("users.id"), nullable=False)
    name     = Column(String, nullable=False)
    tags     = Column(Text, default="[]")
    components_json = Column(Text, default="[]")  # JSON list of {food_id, amount_g, unit}


class LogEntryDB(Base):
    __tablename__ = "log_entries"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = Column(String, ForeignKey("users.id"), nullable=False)
    log_date     = Column(Date, nullable=False, index=True)
    food_id      = Column(String, ForeignKey("foods.id"), nullable=False)
    amount_g     = Column(Float, nullable=False)
    unit         = Column(String, default="g")
    meal_slot    = Column(String, default="Other")
    saved_meal_id = Column(String, nullable=True)
    notes        = Column(String, default="")


class WeightEntryDB(Base):
    __tablename__ = "weight_entries"

    id       = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id  = Column(String, ForeignKey("users.id"), nullable=False)
    log_date = Column(Date, nullable=False, index=True)
    weight_kg = Column(Float, nullable=False)
    notes    = Column(String, default="")


class WaterEntryDB(Base):
    __tablename__ = "water_entries"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, ForeignKey("users.id"), nullable=False)
    log_date   = Column(Date, nullable=False, index=True)
    amount_ml  = Column(Float, nullable=False)


# ── Helpers ───────────────────────────────────────────────────────────────────

def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_food_db() -> None:
    """Load or refresh seed foods in the database."""
    from nutrition_core.food_db.seed_data import SEED_FOODS

    with SessionLocal() as db:
        for food_data in SEED_FOODS:
            nutrients = food_data.get("nutrients_per_100g", {})
            row = db.query(FoodDB).filter(FoodDB.name == food_data["name"]).first()
            if row is None:
                row = FoodDB(
                    id=str(uuid.uuid4()),
                    name=food_data["name"],
                    aliases=json.dumps(food_data.get("aliases", [])),
                    category=food_data["category"],
                    default_serving_g=food_data["default_serving_g"],
                    default_unit=food_data["default_unit"],
                    tags=json.dumps(food_data.get("tags", [])),
                    nutrients_json=json.dumps(nutrients),
                )
                db.add(row)
            else:
                row.aliases = json.dumps(food_data.get("aliases", []))
                row.category = food_data["category"]
                row.default_serving_g = food_data["default_serving_g"]
                row.default_unit = food_data["default_unit"]
                row.tags = json.dumps(food_data.get("tags", []))
                row.nutrients_json = json.dumps(nutrients)
        db.commit()
