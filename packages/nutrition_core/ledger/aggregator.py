"""Nutrient aggregation across a daily log."""
from __future__ import annotations

from nutrition_core.constants import add_nutrients, empty_nutrients
from nutrition_core.food_db.models import FoodItem
from nutrition_core.ledger.models import DailyLog


def aggregate_nutrients(
    daily_log: DailyLog,
    food_map: dict[str, FoodItem],
) -> dict[str, float]:
    """
    Sum nutrients for all entries in a DailyLog.

    Unknown food IDs are silently skipped (log will show 0 contribution).
    Returns a nutrient dict with all V1 keys present.
    """
    total = empty_nutrients()
    for entry in daily_log.entries:
        food = food_map.get(entry.food_id)
        if food is None:
            continue
        serving = food.nutrients_for_serving(entry.amount_g)
        total = add_nutrients(total, serving)
    return total
