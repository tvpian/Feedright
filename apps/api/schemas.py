"""Pydantic schemas for request/response validation."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Profiles ──────────────────────────────────────────────────────────────────

class SupplementIn(BaseModel):
    name: str
    daily_nutrients: dict[str, float] = {}


class ProfileCreate(BaseModel):
    name: str
    age: int = Field(ge=10, le=120)
    sex: str  # "male" | "female" | "other"
    weight_kg: float = Field(gt=20, lt=300)
    height_cm: float = Field(gt=100, lt=250)
    activity_level: str  # ActivityLevel enum value
    goal_mode: str = "maintenance"  # legacy GoalMode — optional now
    dietary_preferences: list[str] = []
    avoid_foods: list[str] = []
    supplement_ids: list[str] = []    # legacy
    # ── New holistic fields ──
    health_goals: list[str] = []
    health_conditions: list[str] = []
    supplements: list[SupplementIn] = []
    water_goal_ml: Optional[float] = None  # Custom daily water target
    role: str = "solo"  # "solo", "coach", "client"
    coach_id: Optional[str] = None


class ProfileOut(ProfileCreate):
    id: str
    has_pin: bool = False

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    activity_level: Optional[str] = None
    goal_mode: Optional[str] = None
    dietary_preferences: Optional[list[str]] = None
    avoid_foods: Optional[list[str]] = None
    health_goals: Optional[list[str]] = None
    health_conditions: Optional[list[str]] = None
    supplements: Optional[list[SupplementIn]] = None
    water_goal_ml: Optional[float] = None
    role: Optional[str] = None
    coach_id: Optional[str] = None


# ── Foods ─────────────────────────────────────────────────────────────────────

class FoodOut(BaseModel):
    id: str
    name: str
    aliases: list[str]
    category: str
    default_serving_g: float
    default_unit: str
    tags: list[str]
    nutrients_per_100g: dict[str, float]
    is_custom: bool

    class Config:
        from_attributes = True


class FoodCreate(BaseModel):
    name: str
    aliases: list[str] = []
    category: str
    default_serving_g: float
    default_unit: str = "g"
    tags: list[str] = []
    nutrients_per_100g: dict[str, float]


# ── Log Entries ───────────────────────────────────────────────────────────────

class LogEntryCreate(BaseModel):
    food_id: str
    amount_g: float = Field(gt=0)
    unit: str = "g"
    meal_slot: str = "Other"
    saved_meal_id: Optional[str] = None
    notes: str = ""


class LogEntryOut(BaseModel):
    id: str
    user_id: str
    log_date: date
    food_id: str
    amount_g: float
    unit: str
    meal_slot: str
    saved_meal_id: Optional[str]
    notes: str
    # denormalized food info for UI convenience
    food_name: Optional[str] = None
    food_default_serving_g: Optional[float] = None
    food_default_unit: Optional[str] = None
    food_nutrients_per_100g: Optional[dict[str, float]] = None

    class Config:
        from_attributes = True


class DailyLogOut(BaseModel):
    user_id: str
    log_date: date
    entries: list[LogEntryOut]
    nutrient_totals: dict[str, float]


# ── Targets ───────────────────────────────────────────────────────────────────

class DailyTargetsOut(BaseModel):
    user_id: str
    targets: dict[str, float]
    raw_targets: dict[str, float] = {}   # before supplement offsets


# ── Gap Analysis ──────────────────────────────────────────────────────────────

class NutrientGapOut(BaseModel):
    key: str
    target: float
    consumed: float
    percent_complete: float
    deficit: float
    status: str
    urgency_score: float
    is_limit: bool = False


class GapAnalysisOut(BaseModel):
    user_id: str
    log_date: date
    gaps: list[NutrientGapOut]
    summary: str


# ── Recommendations ───────────────────────────────────────────────────────────

class NutrientContributionOut(BaseModel):
    key: str
    gap_before: float
    covered: float
    gap_after: float
    percent_of_gap_closed: float


class FoodRecommendationOut(BaseModel):
    food: FoodOut
    serving_g: float
    score: float
    estimated_calories: float
    explanation: str
    contributions: list[NutrientContributionOut]


class ComboRecommendationOut(BaseModel):
    foods: list[FoodOut]
    servings_g: list[float]
    score: float
    estimated_calories: float
    explanation: str
    contributions: list[NutrientContributionOut]


class RecommendationResultOut(BaseModel):
    user_id: str
    log_date: date
    singles: list[FoodRecommendationOut]
    combos: list[ComboRecommendationOut]


class RecommendationRequest(BaseModel):
    max_calories: Optional[float] = None
    constraints: list[str] = []   # "no-cook", "vegetarian", "vegan", etc.
    preferred_tags: list[str] = []
    require_tags: list[str] = []  # cuisine filters: only show foods with ANY of these tags


# ── Saved Meals ───────────────────────────────────────────────────────────────

class MealComponentIn(BaseModel):
    food_id: str
    amount_g: float
    unit: str = "g"


class SavedMealCreate(BaseModel):
    name: str
    tags: list[str] = []
    components: list[MealComponentIn]


class SavedMealOut(BaseModel):
    id: str
    user_id: str
    name: str
    tags: list[str]
    components: list[MealComponentIn]
    total_calories: Optional[float] = None

    class Config:
        from_attributes = True


# ── Weight Tracker ────────────────────────────────────────────────────────────

class WeightEntryCreate(BaseModel):
    weight_kg: float = Field(gt=20, lt=500)
    log_date: Optional[date] = None   # defaults to today
    notes: str = ""


class WeightEntryOut(BaseModel):
    id: str
    user_id: str
    log_date: date
    weight_kg: float
    notes: str

    class Config:
        from_attributes = True


# ── What-if Preview ───────────────────────────────────────────────────────────

class WhatIfRequest(BaseModel):
    food_id: str
    amount_g: float = Field(gt=0)
    # Optional inline nutrients — used when the food hasn't been imported yet
    # (e.g. USDA FDC foods selected but not yet saved to the local DB)
    food_name: Optional[str] = None
    nutrients_per_100g: Optional[dict[str, float]] = None


class WhatIfGap(BaseModel):
    key: str
    before_pct: float
    after_pct: float
    delta_pct: float
    is_limit: bool = False


class WhatIfResponse(BaseModel):
    food_name: str
    calories_added: float
    gaps: list[WhatIfGap]


# ── Favorites ─────────────────────────────────────────────────────────────────

class FavoriteFoodOut(BaseModel):
    food_id: str
    food_name: str
    count: int
    last_logged: date


# ── Analytics / Trends ────────────────────────────────────────────────────────

class DailyNutrientSnapshot(BaseModel):
    log_date: date
    nutrient_totals: dict[str, float]
    calorie_total: float


class TrendResponse(BaseModel):
    user_id: str
    days: int
    snapshots: list[DailyNutrientSnapshot]


class StreakInfo(BaseModel):
    current_streak: int
    longest_streak: int
    total_logged_days: int
    last_logged_date: Optional[date]


class WeeklyAverages(BaseModel):
    user_id: str
    days: int
    averages: dict[str, float]
    low_nutrients: list[str]   # consistently below 60% target


# ── Common Supplements Reference ──────────────────────────────────────────────

class CommonSupplementOut(BaseModel):
    key: str
    label: str
    daily_nutrients: dict[str, float]


# ── Water Tracking ────────────────────────────────────────────────────────────

class WaterEntryCreate(BaseModel):
    amount_ml: float = Field(gt=0)


class WaterEntryOut(BaseModel):
    id: str
    user_id: str
    log_date: date
    amount_ml: float

    class Config:
        from_attributes = True


class WaterDaySummary(BaseModel):
    date: date
    total_ml: float
    goal_ml: float
    entries: list[WaterEntryOut]
