"""Analytics router — trends, streaks, favorites, what-if preview."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..converters import food_db_to_domain
from ..database import FoodDB, LogEntryDB, UserDB, get_db
from ..schemas import (
    CommonSupplementOut,
    DailyNutrientSnapshot,
    FavoriteFoodOut,
    StreakInfo,
    TrendResponse,
    WeeklyAverages,
    WhatIfGap,
    WhatIfRequest,
    WhatIfResponse,
)
from nutrition_core.constants import LIMIT_NUTRIENTS
from nutrition_core.ledger.aggregator import aggregate_nutrients
from nutrition_core.ledger.models import DailyLog, LogEntry
from nutrition_core.targets.engine import COMMON_SUPPLEMENTS, compute_targets

router = APIRouter()


# ── Nutrient Trends ───────────────────────────────────────────────────────────

@router.get("/{user_id}/trends", response_model=TrendResponse)
def get_trends(
    user_id: str,
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    _assert_user(user_id, db)
    today = date.today()
    snapshots: list[DailyNutrientSnapshot] = []

    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        totals = _day_totals(user_id, d, db)
        cal = totals.get("calories", 0.0)
        snapshots.append(DailyNutrientSnapshot(log_date=d, nutrient_totals=totals, calorie_total=cal))

    return TrendResponse(user_id=user_id, days=days, snapshots=snapshots)


# ── Logging Streaks ───────────────────────────────────────────────────────────

@router.get("/{user_id}/streaks", response_model=StreakInfo)
def get_streaks(user_id: str, db: Session = Depends(get_db)):
    _assert_user(user_id, db)

    dates = (
        db.query(LogEntryDB.log_date)
        .filter(LogEntryDB.user_id == user_id)
        .distinct()
        .order_by(LogEntryDB.log_date.desc())
        .all()
    )
    unique_dates = sorted({d[0] for d in dates}, reverse=True)

    if not unique_dates:
        return StreakInfo(current_streak=0, longest_streak=0, total_logged_days=0, last_logged_date=None)

    # current streak from today backwards
    current = 0
    check = date.today()
    for d in unique_dates:
        if d == check:
            current += 1
            check -= timedelta(days=1)
        elif d < check:
            break

    # longest streak
    sorted_asc = sorted(unique_dates)
    longest = 1
    run = 1
    for i in range(1, len(sorted_asc)):
        if (sorted_asc[i] - sorted_asc[i - 1]).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1

    return StreakInfo(
        current_streak=current,
        longest_streak=longest,
        total_logged_days=len(unique_dates),
        last_logged_date=unique_dates[0],
    )


# ── Weekly Averages + Low-Nutrient Alerts ─────────────────────────────────────

@router.get("/{user_id}/averages", response_model=WeeklyAverages)
def get_averages(
    user_id: str,
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    _assert_user(user_id, db)

    # Get targets for this user
    from ..routers.targets import _row_to_profile
    row = db.query(UserDB).filter(UserDB.id == user_id).first()
    profile = _row_to_profile(row)
    targets = compute_targets(profile).as_dict()

    today = date.today()
    sums: dict[str, float] = defaultdict(float)
    logged_days = 0

    for i in range(days):
        d = today - timedelta(days=i)
        totals = _day_totals(user_id, d, db)
        if any(v > 0 for v in totals.values()):
            logged_days += 1
            for k, v in totals.items():
                sums[k] += v

    divisor = max(logged_days, 1)
    averages = {k: round(v / divisor, 2) for k, v in sums.items()}

    # Find nutrients consistently below 60% of target
    low: list[str] = []
    for k, target_val in targets.items():
        if target_val > 0:
            avg_pct = averages.get(k, 0) / target_val * 100
            if avg_pct < 60:
                low.append(k)

    return WeeklyAverages(user_id=user_id, days=days, averages=averages, low_nutrients=low)


# ── Favorites (most-logged foods) ────────────────────────────────────────────

@router.get("/{user_id}/favorites", response_model=list[FavoriteFoodOut])
def get_favorites(
    user_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    _assert_user(user_id, db)

    results = (
        db.query(
            LogEntryDB.food_id,
            func.count(LogEntryDB.id).label("cnt"),
            func.max(LogEntryDB.log_date).label("last_date"),
        )
        .filter(LogEntryDB.user_id == user_id)
        .group_by(LogEntryDB.food_id)
        .order_by(func.count(LogEntryDB.id).desc())
        .limit(limit)
        .all()
    )

    out = []
    for food_id, cnt, last_date in results:
        food = db.query(FoodDB).filter(FoodDB.id == food_id).first()
        if food:
            out.append(FavoriteFoodOut(
                food_id=food_id,
                food_name=food.name,
                count=cnt,
                last_logged=last_date,
            ))
    return out


# ── What-If Preview ──────────────────────────────────────────────────────────

@router.post("/{user_id}/{log_date}/what-if", response_model=WhatIfResponse)
def what_if_preview(
    user_id: str,
    log_date: date,
    body: WhatIfRequest,
    db: Session = Depends(get_db),
):
    _assert_user(user_id, db)

    food_row = db.query(FoodDB).filter(FoodDB.id == body.food_id).first()
    if not food_row:
        raise HTTPException(404, f"Food {body.food_id} not found")

    food = food_db_to_domain(food_row)

    # Get targets
    from ..routers.targets import _row_to_profile
    user_row = db.query(UserDB).filter(UserDB.id == user_id).first()
    targets = compute_targets(_row_to_profile(user_row)).as_dict()

    # Current day totals
    current_totals = _day_totals(user_id, log_date, db)

    # Compute what the food would add
    factor = body.amount_g / 100.0
    food_nutrients = {k: v * factor for k, v in food.nutrients_per_100g.items()}

    # Projected totals
    projected_totals = {k: current_totals.get(k, 0) + food_nutrients.get(k, 0) for k in targets}

    calories_added = food_nutrients.get("calories", 0)

    gaps: list[WhatIfGap] = []
    for k, target_val in targets.items():
        if target_val <= 0:
            continue
        before_pct = round(current_totals.get(k, 0) / target_val * 100, 1)
        after_pct = round(projected_totals.get(k, 0) / target_val * 100, 1)
        delta = round(after_pct - before_pct, 1)
        is_limit = k in LIMIT_NUTRIENTS
        if is_limit:
            # For limit nutrients, always show them if food adds any
            if delta > 0.1:
                gaps.append(WhatIfGap(key=k, before_pct=before_pct, after_pct=after_pct, delta_pct=delta, is_limit=True))
        else:
            if delta > 0.5:  # only show meaningful changes
                gaps.append(WhatIfGap(key=k, before_pct=before_pct, after_pct=after_pct, delta_pct=delta, is_limit=False))

    # Sort: limit-nutrient warnings first, then biggest improvements
    gaps.sort(key=lambda g: (0 if g.is_limit else 1, -g.delta_pct))

    return WhatIfResponse(food_name=food_row.name, calories_added=round(calories_added, 1), gaps=gaps[:15])


# ── Common Supplements Reference ─────────────────────────────────────────────

@router.get("/supplements/common", response_model=list[CommonSupplementOut])
def list_common_supplements():
    out = []
    for key, nutrients in COMMON_SUPPLEMENTS.items():
        label = key.replace("_", " ").title()
        out.append(CommonSupplementOut(key=key, label=label, daily_nutrients=nutrients))
    return out


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_user(user_id: str, db: Session):
    user = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not user:
        raise HTTPException(404, f"User {user_id} not found")


def _day_totals(user_id: str, log_date: date, db: Session) -> dict[str, float]:
    """Compute nutrient totals for a single day."""
    rows = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == log_date)
        .all()
    )
    if not rows:
        from nutrition_core.constants import empty_nutrients
        return empty_nutrients()

    food_map = {}
    for r in rows:
        if r.food_id not in food_map:
            fdb = db.query(FoodDB).filter(FoodDB.id == r.food_id).first()
            if fdb:
                food_map[r.food_id] = food_db_to_domain(fdb)

    log = DailyLog(user_id=user_id, log_date=log_date)
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
