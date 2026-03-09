"""Simple in-memory food search over the food database."""
from __future__ import annotations

from nutrition_core.food_db.models import FoodItem


def search_foods(
    query: str,
    food_map: dict[str, FoodItem],
    max_results: int = 20,
) -> list[FoodItem]:
    """
    Case-insensitive substring search across food name + aliases.
    Returns up to `max_results` FoodItem objects, sorted by name.
    """
    q = query.strip().lower()
    if not q:
        return sorted(food_map.values(), key=lambda f: f.name)[:max_results]

    results: list[FoodItem] = []
    for food in food_map.values():
        searchable = [food.name.lower()] + [a.lower() for a in food.aliases]
        if any(q in s for s in searchable):
            results.append(food)

    results.sort(key=lambda f: (not f.name.lower().startswith(q), f.name))
    return results[:max_results]
