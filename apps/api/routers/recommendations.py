"""Recommendations router — gap analysis + next-food ranking."""
from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..converters import food_db_to_domain, food_domain_to_schema
from ..database import FoodDB, LogEntryDB, UserDB, get_db
from .logs import _compute_totals
from .targets import _row_to_profile
from ..schemas import (
    ComboRecommendationOut,
    FoodRecommendationOut,
    GapAnalysisOut,
    NutrientContributionOut,
    NutrientGapOut,
    RecommendationRequest,
    RecommendationResultOut,
)
from nutrition_core.analysis.engine import analyze_gaps
from nutrition_core.recommender.engine import (
    RecommendationRequest as CoreRequest,
    recommend,
)
from nutrition_core.targets.engine import compute_targets

router = APIRouter()


@router.get("/{user_id}/{log_date}/gaps", response_model=GapAnalysisOut)
def get_gap_analysis(user_id: str, log_date: date, db: Session = Depends(get_db)):
    row = _require_user(user_id, db)
    profile = _row_to_profile(row)
    targets = compute_targets(profile)

    entries = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == log_date)
        .all()
    )
    totals = _compute_totals(entries, db)
    gap_analysis = analyze_gaps(totals, targets)

    gaps_out = [
        NutrientGapOut(
            key=g.key,
            target=round(g.target, 2),
            consumed=round(g.consumed, 2),
            percent_complete=round(g.percent_complete, 1),
            deficit=round(g.deficit, 2),
            status=g.status.value,
            urgency_score=round(g.urgency_score, 3),
            is_limit=g.is_limit,
        )
        for g in gap_analysis.sorted_by_urgency()
    ]
    return GapAnalysisOut(
        user_id=user_id,
        log_date=log_date,
        gaps=gaps_out,
        summary=gap_analysis.summary_text(),
    )


@router.post("/{user_id}/{log_date}", response_model=RecommendationResultOut)
def get_recommendations(
    user_id: str,
    log_date: date,
    body: RecommendationRequest,
    db: Session = Depends(get_db),
):
    row = _require_user(user_id, db)
    profile = _row_to_profile(row)
    targets = compute_targets(profile)

    # Compute today's intake
    entries = (
        db.query(LogEntryDB)
        .filter(LogEntryDB.user_id == user_id, LogEntryDB.log_date == log_date)
        .all()
    )
    totals = _compute_totals(entries, db)
    gap_analysis = analyze_gaps(totals, targets)

    # Load full food library
    all_foods = db.query(FoodDB).all()
    food_map = {r.id: food_db_to_domain(r) for r in all_foods}

    # Merge user avoid list with request constraints
    avoid_ids = json.loads(row.avoid_foods) if row.avoid_foods else []

    result = recommend(CoreRequest(
        gap_analysis=gap_analysis,
        food_library=food_map,
        avoid_ids=avoid_ids,
        avoid_tags=[],
        preferred_tags=body.preferred_tags,
        max_calories=body.max_calories,
        constraints=body.constraints,
    ))

    singles_out = [
        FoodRecommendationOut(
            food=food_domain_to_schema(r.food),
            serving_g=r.serving_g,
            score=round(r.score, 4),
            estimated_calories=round(r.estimated_calories, 1),
            explanation=r.explanation,
            contributions=[
                NutrientContributionOut(
                    key=c.key,
                    gap_before=round(c.gap_before, 2),
                    covered=round(c.covered, 2),
                    gap_after=round(c.gap_after, 2),
                    percent_of_gap_closed=round(c.percent_of_gap_closed, 1),
                )
                for c in r.contributions
            ],
        )
        for r in result.singles[:10]
    ]

    combos_out = [
        ComboRecommendationOut(
            foods=[food_domain_to_schema(f) for f in r.foods],
            servings_g=r.servings_g,
            score=round(r.score, 4),
            estimated_calories=round(r.estimated_calories, 1),
            explanation=r.explanation,
            contributions=[
                NutrientContributionOut(
                    key=c.key,
                    gap_before=round(c.gap_before, 2),
                    covered=round(c.covered, 2),
                    gap_after=round(c.gap_after, 2),
                    percent_of_gap_closed=round(c.percent_of_gap_closed, 1),
                )
                for c in r.contributions
            ],
        )
        for r in result.combos
    ]

    return RecommendationResultOut(
        user_id=user_id,
        log_date=log_date,
        singles=singles_out,
        combos=combos_out,
    )


def _require_user(user_id: str, db: Session) -> UserDB:
    row = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
    if not row:
        raise HTTPException(404, f"User {user_id} not found")
    return row
