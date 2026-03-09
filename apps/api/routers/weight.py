"""Weight tracking router."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import WeightEntryDB, UserDB, get_db
from ..schemas import WeightEntryCreate, WeightEntryOut

router = APIRouter()


@router.post("/{user_id}", response_model=WeightEntryOut, status_code=201)
def log_weight(user_id: str, body: WeightEntryCreate, db: Session = Depends(get_db)):
    _assert_user(user_id, db)
    log_date = body.log_date or date.today()

    # Upsert — one weight per day
    existing = (
        db.query(WeightEntryDB)
        .filter(WeightEntryDB.user_id == user_id, WeightEntryDB.log_date == log_date)
        .first()
    )
    if existing:
        existing.weight_kg = body.weight_kg
        existing.notes = body.notes
        db.commit()
        db.refresh(existing)
        return existing

    row = WeightEntryDB(
        user_id=user_id,
        log_date=log_date,
        weight_kg=body.weight_kg,
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{user_id}", response_model=list[WeightEntryOut])
def get_weight_history(
    user_id: str,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    _assert_user(user_id, db)
    cutoff = date.today() - timedelta(days=days)
    rows = (
        db.query(WeightEntryDB)
        .filter(WeightEntryDB.user_id == user_id, WeightEntryDB.log_date >= cutoff)
        .order_by(WeightEntryDB.log_date)
        .all()
    )
    return rows


@router.delete("/{entry_id}", status_code=204)
def delete_weight_entry(entry_id: str, db: Session = Depends(get_db)):
    row = db.query(WeightEntryDB).filter(WeightEntryDB.id == entry_id).first()
    if not row:
        raise HTTPException(404, "Weight entry not found")
    db.delete(row)
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_user(user_id: str, db: Session):
    user = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not user:
        raise HTTPException(404, f"User {user_id} not found")
