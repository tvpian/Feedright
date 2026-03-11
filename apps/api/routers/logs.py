"""Daily log router — CRUD for food intake entries."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..converters import food_db_to_domain
from ..database import FoodDB, LogEntryDB, UserDB, get_db
from ..schemas import DailyLogOut, LogEntryCreate, LogEntryOut
from nutrition_core.ledger.aggregator import aggregate_nutrients
from nutrition_core.ledger.models import DailyLog, LogEntry

router = APIRouter()


@router.get("/{user_id}/{log_date}", response_model=DailyLogOut)
def get_daily_log(user_id: str, log_date: date, db: Session = Depends(get_db)):
    _require_user(user_id, db)
    rows = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == log_date)
        .all()
    )
    entries_out = [_row_to_out(r, db) for r in rows]
    totals = _compute_totals(rows, db)
    return DailyLogOut(
        user_id=user_id,
        log_date=log_date,
        entries=entries_out,
        nutrient_totals=totals,
    )


@router.post("/{user_id}/{log_date}", response_model=LogEntryOut, status_code=201)
def add_log_entry(
    user_id: str,
    log_date: date,
    body: LogEntryCreate,
    db: Session = Depends(get_db),
):
    _require_user(user_id, db)
    _require_food(body.food_id, db)
    row = LogEntryDB(
        user_id=user_id,
        log_date=log_date,
        food_id=body.food_id,
        amount_g=body.amount_g,
        unit=body.unit,
        meal_slot=body.meal_slot,
        saved_meal_id=body.saved_meal_id,
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_out(row, db)


@router.patch("/{user_id}/{log_date}/{entry_id}", response_model=LogEntryOut)
def update_log_entry(
    user_id: str,
    log_date: date,
    entry_id: str,
    body: LogEntryCreate,
    db: Session = Depends(get_db),
):
    row = _get_entry_or_404(entry_id, user_id, log_date, db)
    row.food_id = body.food_id
    row.amount_g = body.amount_g
    row.unit = body.unit
    row.meal_slot = body.meal_slot
    row.notes = body.notes
    db.commit()
    db.refresh(row)
    return _row_to_out(row, db)


@router.delete("/{user_id}/{log_date}/{entry_id}", status_code=204)
def delete_log_entry(
    user_id: str, log_date: date, entry_id: str, db: Session = Depends(get_db)
):
    row = _get_entry_or_404(entry_id, user_id, log_date, db)
    db.delete(row)
    db.commit()


@router.post("/{user_id}/{log_date}/copy-yesterday", response_model=DailyLogOut)
def copy_from_yesterday(user_id: str, log_date: date, db: Session = Depends(get_db)):
    """Duplicate all entries from the previous day into log_date."""
    from datetime import timedelta
    _require_user(user_id, db)
    yesterday = log_date - timedelta(days=1)
    prev_rows = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == yesterday)
        .all()
    )
    for r in prev_rows:
        db.add(LogEntryDB(
            user_id=user_id,
            log_date=log_date,
            food_id=r.food_id,
            amount_g=r.amount_g,
            unit=r.unit,
            meal_slot=r.meal_slot,
            notes=r.notes,
        ))
    db.commit()
    return get_daily_log(user_id, log_date, db)


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_user(user_id: str, db: Session):
    if not db.query(UserDB).filter(UserDB.id == user_id).first():
        raise HTTPException(404, f"User {user_id} not found")


def _require_food(food_id: str, db: Session):
    if not db.query(FoodDB).filter(FoodDB.id == food_id).first():
        raise HTTPException(404, f"Food {food_id} not found")


def _get_entry_or_404(entry_id: str, user_id: str, log_date: date, db: Session) -> LogEntryDB:
    row = db.query(LogEntryDB).filter(
        LogEntryDB.id == entry_id,
        LogEntryDB.user_id == user_id,
        LogEntryDB.log_date == log_date,
    ).first()
    if not row:
        raise HTTPException(404, f"Log entry {entry_id} not found")
    return row


def _row_to_out(row: LogEntryDB, db: Session) -> LogEntryOut:
    food = db.query(FoodDB).filter(FoodDB.id == row.food_id).first()
    import json as _json
    nutrients = None
    if food:
        try:
            nutrients = _json.loads(food.nutrients_json)
        except Exception:
            pass
    return LogEntryOut(
        id=row.id,
        user_id=row.user_id,
        log_date=row.log_date,
        food_id=row.food_id,
        amount_g=row.amount_g,
        unit=row.unit,
        meal_slot=row.meal_slot,
        saved_meal_id=row.saved_meal_id,
        notes=row.notes,
        food_name=food.name if food else None,
        food_default_serving_g=food.default_serving_g if food else None,
        food_default_unit=food.default_unit if food else None,
        food_nutrients_per_100g=nutrients,
    )


def _compute_totals(rows: list[LogEntryDB], db: Session) -> dict[str, float]:
    from nutrition_core.ledger.models import DailyLog, LogEntry
    from datetime import date as _date

    if not rows:
        from nutrition_core.constants import empty_nutrients
        return empty_nutrients()

    food_ids = {r.food_id for r in rows}
    food_map = {}
    for fid in food_ids:
        fdb = db.query(FoodDB).filter(FoodDB.id == fid).first()
        if fdb:
            food_map[fid] = food_db_to_domain(fdb)

    log = DailyLog(user_id=rows[0].user_id, log_date=rows[0].log_date)
    for r in rows:
        log.add(LogEntry(
            user_id=r.user_id,
            log_date=r.log_date,
            food_id=r.food_id,
            amount_g=r.amount_g,
            unit=r.unit,
            meal_slot=r.meal_slot,
            id=r.id,
        ))
    return aggregate_nutrients(log, food_map)
