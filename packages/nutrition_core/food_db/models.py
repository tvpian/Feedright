"""Food database domain models."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
import uuid

from nutrition_core.constants import (
    NUTRIENT_KEYS,
    empty_nutrients,
    scale_nutrients,
)


@dataclass
class FoodItem:
    """
    A single food record with nutrient values per 100 g (or 100 ml for liquids).
    Serving-size nutrients are derived on demand by scaling.
    """
    name: str
    category: str                          # e.g. "protein", "vegetable", "dairy"
    default_serving_g: float              # default serving size in grams
    default_unit: str                      # display unit, e.g. "g", "oz", "cup", "piece"
    # Nutrients are stored per 100 g of the food.
    nutrients_per_100g: dict[str, float] = field(default_factory=empty_nutrients)
    aliases: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)    # e.g. "quick", "no-cook", "vegan"
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    is_custom: bool = False               # True for user-defined foods

    def nutrients_for_serving(self, amount_g: Optional[float] = None) -> dict[str, float]:
        """Return nutrient dict scaled to `amount_g` grams (default: default_serving_g)."""
        grams = amount_g if amount_g is not None else self.default_serving_g
        factor = grams / 100.0
        return scale_nutrients(self.nutrients_per_100g, factor)

    def nutrient_density(self) -> float:
        """Protein-per-calorie ratio (g protein / 100 kcal)."""
        kcal = self.nutrients_per_100g.get("calories", 0)
        protein = self.nutrients_per_100g.get("protein", 0)
        if kcal == 0:
            return 0.0
        return (protein / kcal) * 100


@dataclass
class MealComponent:
    food_id: str
    amount_g: float
    unit: str = "g"


@dataclass
class SavedMeal:
    """A reusable bundle of food items (e.g. 'Usual Breakfast')."""
    name: str
    user_id: str
    components: list[MealComponent] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def total_nutrients(self, food_map: dict[str, FoodItem]) -> dict[str, float]:
        """Compute combined nutrients using a food_id → FoodItem lookup."""
        from nutrition_core.constants import add_nutrients

        total = empty_nutrients()
        for comp in self.components:
            food = food_map.get(comp.food_id)
            if food is None:
                continue
            serving = food.nutrients_for_serving(comp.amount_g)
            total = add_nutrients(total, serving)
        return total
