"""Foods router — search, create custom foods, get by id."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..converters import food_db_to_schema
from ..database import FoodDB, get_db
from ..schemas import FoodCreate, FoodOut
from nutrition_core.constants import empty_nutrients

router = APIRouter()


@router.get("", response_model=list[FoodOut])
def search_foods(
    q: str = Query("", description="Name/alias search term"),
    category: str = Query("", description="Filter by category"),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(FoodDB)
    if q:
        # SQLite LIKE search (case-insensitive via LOWER)
        query = query.filter(
            FoodDB.name.ilike(f"%{q}%")
            # alias search covered by a separate pass below
        )
    if category:
        query = query.filter(FoodDB.category == category)
    results = query.limit(limit).all()

    # Also check aliases if q provided
    if q and len(results) < limit:
        alias_matches = (
            db.query(FoodDB)
            .filter(FoodDB.aliases.ilike(f"%{q}%"))
            .limit(limit - len(results))
            .all()
        )
        seen = {r.id for r in results}
        results += [r for r in alias_matches if r.id not in seen]

    return [food_db_to_schema(r) for r in results[:limit]]


@router.get("/{food_id}", response_model=FoodOut)
def get_food(food_id: str, db: Session = Depends(get_db)):
    row = db.query(FoodDB).filter(FoodDB.id == food_id).first()
    if not row:
        raise HTTPException(404, f"Food {food_id} not found")
    return food_db_to_schema(row)


@router.post("", response_model=FoodOut, status_code=201)
def create_custom_food(body: FoodCreate, db: Session = Depends(get_db)):
    base = empty_nutrients()
    base.update(body.nutrients_per_100g)
    row = FoodDB(
        name=body.name,
        aliases=json.dumps(body.aliases),
        category=body.category,
        default_serving_g=body.default_serving_g,
        default_unit=body.default_unit,
        tags=json.dumps(body.tags),
        nutrients_json=json.dumps(base),
        is_custom=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return food_db_to_schema(row)
