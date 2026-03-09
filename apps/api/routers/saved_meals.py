"""Saved meals router."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..converters import food_db_to_domain
from ..database import FoodDB, LogEntryDB, SavedMealDB, UserDB, get_db
from ..schemas import LogEntryOut, MealComponentIn, SavedMealCreate, SavedMealOut
from nutrition_core.food_db.models import MealComponent, SavedMeal

router = APIRouter()


@router.get("/{user_id}", response_model=list[SavedMealOut])
def list_saved_meals(user_id: str, db: Session = Depends(get_db)):
    _require_user(user_id, db)
    rows = db.query(SavedMealDB).filter(SavedMealDB.user_id == user_id).all()
    return [_to_out(r, db) for r in rows]


@router.post("/{user_id}", response_model=SavedMealOut, status_code=201)
def create_saved_meal(user_id: str, body: SavedMealCreate, db: Session = Depends(get_db)):
    _require_user(user_id, db)
    row = SavedMealDB(
        user_id=user_id,
        name=body.name,
        tags=json.dumps(body.tags),
        components_json=json.dumps([c.model_dump() for c in body.components]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row, db)


@router.delete("/{user_id}/{meal_id}", status_code=204)
def delete_saved_meal(user_id: str, meal_id: str, db: Session = Depends(get_db)):
    row = _get_or_404(meal_id, user_id, db)
    db.delete(row)
    db.commit()


@router.post("/{user_id}/{meal_id}/log/{log_date}", response_model=list[LogEntryOut])
def log_saved_meal(user_id: str, meal_id: str, log_date, db: Session = Depends(get_db)):
    """Add all components of a saved meal as individual log entries for a date."""
    from datetime import date as _date
    if isinstance(log_date, str):
        log_date = _date.fromisoformat(log_date)
    row = _get_or_404(meal_id, user_id, db)
    components = json.loads(row.components_json)
    added = []
    for comp in components:
        entry = LogEntryDB(
            user_id=user_id,
            log_date=log_date,
            food_id=comp["food_id"],
            amount_g=comp["amount_g"],
            unit=comp.get("unit", "g"),
            meal_slot="Other",
            saved_meal_id=meal_id,
        )
        db.add(entry)
        db.flush()
        food = db.query(FoodDB).filter(FoodDB.id == comp["food_id"]).first()
        added.append(LogEntryOut(
            id=entry.id,
            user_id=entry.user_id,
            log_date=entry.log_date,
            food_id=entry.food_id,
            amount_g=entry.amount_g,
            unit=entry.unit,
            meal_slot=entry.meal_slot,
            saved_meal_id=entry.saved_meal_id,
            notes=entry.notes,
            food_name=food.name if food else None,
        ))
    db.commit()
    return added


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_user(user_id: str, db: Session):
    if not db.query(UserDB).filter(UserDB.id == user_id).first():
        raise HTTPException(404, f"User {user_id} not found")


def _get_or_404(meal_id: str, user_id: str, db: Session) -> SavedMealDB:
    row = db.query(SavedMealDB).filter(
        SavedMealDB.id == meal_id, SavedMealDB.user_id == user_id
    ).first()
    if not row:
        raise HTTPException(404, f"Saved meal {meal_id} not found")
    return row


def _to_out(row: SavedMealDB, db: Session) -> SavedMealOut:
    components_raw = json.loads(row.components_json)
    components = [MealComponentIn(**c) for c in components_raw]

    # Compute total calories for display
    total_kcal: float = 0.0
    for comp in components_raw:
        food_row = db.query(FoodDB).filter(FoodDB.id == comp["food_id"]).first()
        if food_row:
            food = food_db_to_domain(food_row)
            total_kcal += food.nutrients_for_serving(comp["amount_g"]).get("calories", 0.0)

    return SavedMealOut(
        id=row.id,
        user_id=row.user_id,
        name=row.name,
        tags=json.loads(row.tags),
        components=components,
        total_calories=round(total_kcal, 1),
    )
