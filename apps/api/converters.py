"""Conversion helpers: DB rows ↔ nutrition_core domain objects."""
from __future__ import annotations

import json

from nutrition_core.food_db.models import FoodItem
from nutrition_core.constants import empty_nutrients

from .database import FoodDB, UserDB
from .schemas import FoodOut


def food_db_to_domain(row: FoodDB) -> FoodItem:
    nutrients_raw = json.loads(row.nutrients_json)
    n = empty_nutrients()
    n.update({k: float(v) for k, v in nutrients_raw.items() if k in n})
    return FoodItem(
        id=row.id,
        name=row.name,
        aliases=json.loads(row.aliases),
        category=row.category,
        default_serving_g=row.default_serving_g,
        default_unit=row.default_unit,
        tags=json.loads(row.tags),
        nutrients_per_100g=n,
        is_custom=row.is_custom,
    )


def food_domain_to_schema(food: FoodItem) -> FoodOut:
    return FoodOut(
        id=food.id,
        name=food.name,
        aliases=food.aliases,
        category=food.category,
        default_serving_g=food.default_serving_g,
        default_unit=food.default_unit,
        tags=food.tags,
        nutrients_per_100g=food.nutrients_per_100g,
        is_custom=food.is_custom,
    )


def food_db_to_schema(row: FoodDB) -> FoodOut:
    return food_domain_to_schema(food_db_to_domain(row))
