"""
Water tracking endpoints.
Goal: 2500 ml/day (configurable later via user settings).
"""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import UserDB, WaterEntryDB, get_db
from ..schemas import WaterDaySummary, WaterEntryCreate, WaterEntryOut

router = APIRouter()

_DEFAULT_GOAL_ML = 2500.0


def _user_water_goal(user_id: str, db: Session) -> float:
    """Return user's configured water goal, or the default."""
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if user and user.water_goal_ml:
        return user.water_goal_ml
    return _DEFAULT_GOAL_ML


@router.get("/{user_id}/{log_date}", response_model=WaterDaySummary)
def get_water_day(user_id: str, log_date: date, db: Session = Depends(get_db)):
    """Return all water entries and total for a given day."""
    rows = (
        db.query(WaterEntryDB)
        .filter(WaterEntryDB.user_id == user_id, WaterEntryDB.log_date == log_date)
        .order_by(WaterEntryDB.id)
        .all()
    )
    total = sum(r.amount_ml for r in rows)
    goal = _user_water_goal(user_id, db)
    return WaterDaySummary(
        date=log_date,
        total_ml=total,
        goal_ml=goal,
        entries=[WaterEntryOut.model_validate(r) for r in rows],
    )


@router.post("/{user_id}/{log_date}", response_model=WaterDaySummary, status_code=status.HTTP_201_CREATED)
def add_water(
    user_id: str,
    log_date: date,
    body: WaterEntryCreate,
    db: Session = Depends(get_db),
):
    """Log a water intake entry and return the updated day summary."""
    row = WaterEntryDB(
        id=str(uuid.uuid4()),
        user_id=user_id,
        log_date=log_date,
        amount_ml=body.amount_ml,
    )
    db.add(row)
    db.commit()
    return get_water_day(user_id, log_date, db)


@router.delete("/{user_id}/{log_date}/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_water(user_id: str, log_date: date, entry_id: str, db: Session = Depends(get_db)):
    """Remove a water entry."""
    row = db.query(WaterEntryDB).filter(
        WaterEntryDB.id == entry_id,
        WaterEntryDB.user_id == user_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Water entry not found")
    db.delete(row)
    db.commit()
