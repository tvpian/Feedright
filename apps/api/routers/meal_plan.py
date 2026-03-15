"""Weekly meal plan generator.

Builds a 7-day plan using the recommendation engine, assigning foods to meal
slots (Breakfast, Lunch, Dinner, Snack) while trying to:
  - Hit daily nutrient targets each day
  - Keep variety across the week (avoid repeating the same food every day)
  - Respect user constraints (vegetarian, no-cook, etc.)
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..converters import food_db_to_domain, food_domain_to_schema
from ..database import FoodDB, UserDB, get_db
from .targets import _row_to_profile
from ..schemas import FoodOut
from nutrition_core.analysis.engine import analyze_gaps
from nutrition_core.constants import empty_nutrients, add_nutrients, scale_nutrients
from nutrition_core.recommender.engine import (
    RecommendationRequest as CoreRequest,
    ScoringConfig,
    recommend,
)
from nutrition_core.targets.engine import compute_targets
from nutrition_core.food_db.models import FoodItem

router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class MealSlotPlan(BaseModel):
    slot: str  # "Breakfast" | "Lunch" | "Dinner" | "Snack"
    foods: list[FoodOut]
    servings_g: list[float]
    estimated_calories: float


class DayPlan(BaseModel):
    day: str  # ISO date
    day_label: str  # "Monday", "Tuesday", etc.
    meals: list[MealSlotPlan]
    total_calories: float


class WeeklyPlanOut(BaseModel):
    user_id: str
    start_date: str
    days: list[DayPlan]
    constraints: list[str]


class MealPlanRequest(BaseModel):
    start_date: str | None = None  # ISO date, defaults to today
    constraints: list[str] = []  # "no-cook", "vegetarian", "vegan"
    max_daily_calories: float | None = None
    seed: int | None = None  # random seed for variety; different seed = different plan
    preferred_tags: list[str] = []  # boost these tags
    require_tags: list[str] = []  # cuisine filter: only foods with these tags


# ── Slot definitions ──────────────────────────────────────────────────────────

_SLOTS = [
    ("Breakfast", 0.25),  # ~25% of daily calories
    ("Lunch",     0.35),  # ~35%
    ("Dinner",    0.30),  # ~30%
    ("Snack",     0.10),  # ~10%
]


# ── Generator ─────────────────────────────────────────────────────────────────

@router.post("/{user_id}", response_model=WeeklyPlanOut)
def generate_meal_plan(
    user_id: str,
    body: MealPlanRequest,
    db: Session = Depends(get_db),
):
    """Generate a 7-day meal plan based on user's targets and preferences."""
    row = _require_user(user_id, db)
    profile = _row_to_profile(row)
    targets = compute_targets(profile)
    targets_dict = targets.as_dict()

    daily_cal = body.max_daily_calories or targets_dict.get("calories", 2000)

    start = date.fromisoformat(body.start_date) if body.start_date else date.today()
    avoid_ids: list[str] = json.loads(str(row.avoid_foods)) if getattr(row, 'avoid_foods', None) else []

    # Random seed for variety — different seed = different plan
    rng = random.Random(body.seed if body.seed is not None else random.randint(0, 2**31))

    # Load food library once
    all_foods = db.query(FoodDB).all()
    food_map: dict[str, FoodItem] = {str(r.id): food_db_to_domain(r) for r in all_foods}

    # Track recently used foods across days for variety
    recently_used: dict[str, int] = {}  # food_id → count this week

    days: list[DayPlan] = []

    for day_offset in range(7):
        current_date = start + timedelta(days=day_offset)
        day_label = current_date.strftime("%A")

        # Start with empty day
        day_totals = empty_nutrients()
        day_meals: list[MealSlotPlan] = []
        day_cal_total = 0.0

        for slot_name, cal_fraction in _SLOTS:
            slot_cal_budget = daily_cal * cal_fraction

            # Compute current gaps for this day so far
            gap_analysis = analyze_gaps(day_totals, targets)

            # Create a scoring config that penalizes recently used foods
            config = ScoringConfig(
                coverage_weight=10.0,
                density_bonus_weight=2.0,
                calorie_penalty_weight=0.005,
                friction_penalty=3.0,
                preference_bonus=2.0,
                top_n_for_combos=8,
                max_combos=5,
            )

            result = recommend(CoreRequest(
                gap_analysis=gap_analysis,
                food_library=food_map,
                avoid_ids=avoid_ids,
                avoid_tags=[],
                preferred_tags=body.preferred_tags,
                require_tags=body.require_tags,
                max_calories=slot_cal_budget * 1.2,  # slight leeway
                constraints=body.constraints,
                config=config,
            ))

            # Pick 1-3 foods for this slot, preferring less-used foods
            slot_foods: list[tuple] = []  # (FoodItem, serving_g, calories)
            slot_cal = 0.0
            slot_nutrients = empty_nutrients()

            candidates = result.singles[:25]  # top 25 candidates

            # Shuffle top candidates with weighted randomness for variety
            # Group into tiers: top-5 (high chance), next-10 (medium), rest (low)
            tier1 = candidates[:5]
            tier2 = candidates[5:15]
            tier3 = candidates[15:]
            rng.shuffle(tier1)
            rng.shuffle(tier2)
            rng.shuffle(tier3)
            candidates_shuffled = tier1 + tier2 + tier3

            # Then sort by variety penalty (less-used first) but within same
            # usage count, the random shuffle above keeps order varied
            def variety_sort_key(rec):
                usage = recently_used.get(rec.food.id, 0)
                return usage  # tie-break is insertion order (randomized above)

            candidates_sorted = sorted(candidates_shuffled, key=variety_sort_key)

            items_for_slot = 2 if slot_name == "Snack" else 3

            for rec in candidates_sorted:
                if len(slot_foods) >= items_for_slot:
                    break
                if slot_cal + rec.estimated_calories > slot_cal_budget * 1.5:
                    continue
                # Skip if already in this slot
                if any(f.id == rec.food.id for f, _, _ in slot_foods):
                    continue

                slot_foods.append((rec.food, rec.serving_g, rec.estimated_calories))
                food_nutrients = scale_nutrients(
                    rec.food.nutrients_per_100g,
                    rec.serving_g / 100.0,
                )
                slot_nutrients = add_nutrients(slot_nutrients, food_nutrients)
                slot_cal += rec.estimated_calories

            # Update day totals
            day_totals = add_nutrients(day_totals, slot_nutrients)
            day_cal_total += slot_cal

            # Track usage
            for food, _, _ in slot_foods:
                recently_used[food.id] = recently_used.get(food.id, 0) + 1

            day_meals.append(MealSlotPlan(
                slot=slot_name,
                foods=[food_domain_to_schema(f) for f, _, _ in slot_foods],
                servings_g=[sg for _, sg, _ in slot_foods],
                estimated_calories=round(slot_cal, 1),
            ))

        days.append(DayPlan(
            day=current_date.isoformat(),
            day_label=day_label,
            meals=day_meals,
            total_calories=round(day_cal_total, 1),
        ))

    return WeeklyPlanOut(
        user_id=user_id,
        start_date=start.isoformat(),
        days=days,
        constraints=body.constraints,
    )


def _require_user(user_id: str, db: Session) -> UserDB:
    row = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not row:
        raise HTTPException(404, f"User {user_id} not found")
    return row
