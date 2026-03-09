"""Targets router — compute and return daily nutrient targets for a user."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import UserDB, get_db
from ..schemas import DailyTargetsOut
from nutrition_core.profiles.models import (
    ActivityLevel,
    DietaryPreference,
    GoalMode,
    HealthCondition,
    HealthGoal,
    Sex,
    Supplement,
    UserProfile,
)
from nutrition_core.targets.engine import compute_targets, _compute_holistic, _compute_legacy, _base_micros, _base_micros_dict

router = APIRouter()


@router.get("/{user_id}", response_model=DailyTargetsOut)
def get_targets(user_id: str, db: Session = Depends(get_db)):
    row = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not row:
        raise HTTPException(404, f"User {user_id} not found")

    profile = _row_to_profile(row)
    targets = compute_targets(profile)

    # Compute raw targets (before supplement offsets) for visibility
    raw_profile = UserProfile(
        id=profile.id, name=profile.name, age=profile.age,
        sex=profile.sex, weight_kg=profile.weight_kg,
        height_cm=profile.height_cm, activity_level=profile.activity_level,
        goal_mode=profile.goal_mode,
        dietary_preferences=profile.dietary_preferences,
        health_goals=profile.health_goals,
        health_conditions=profile.health_conditions,
        supplements=[],  # no supplements for raw targets
    )
    raw_targets = compute_targets(raw_profile)

    return DailyTargetsOut(
        user_id=user_id,
        targets=targets.as_dict(),
        raw_targets=raw_targets.as_dict(),
    )


def _row_to_profile(row: UserDB) -> UserProfile:
    # Parse holistic fields
    raw_goals = json.loads(row.health_goals or "[]")
    raw_conditions = json.loads(row.health_conditions or "[]")
    raw_supps = json.loads(row.supplements_json or "[]")

    health_goals = []
    for g in raw_goals:
        try:
            health_goals.append(HealthGoal(g))
        except ValueError:
            pass

    health_conditions = []
    for c in raw_conditions:
        try:
            health_conditions.append(HealthCondition(c))
        except ValueError:
            pass

    supplements = [Supplement(name=s["name"], daily_nutrients=s.get("daily_nutrients", {})) for s in raw_supps]

    return UserProfile(
        id=row.id,
        name=row.name,
        age=int(row.age),
        sex=Sex(row.sex),
        weight_kg=row.weight_kg,
        height_cm=row.height_cm,
        activity_level=ActivityLevel(row.activity_level),
        goal_mode=GoalMode(row.goal_mode),
        dietary_preferences=[DietaryPreference(p) for p in json.loads(row.dietary_preferences)],
        avoid_foods=json.loads(row.avoid_foods),
        supplement_ids=json.loads(row.supplement_ids),
        health_goals=health_goals,
        health_conditions=health_conditions,
        supplements=supplements,
    )
