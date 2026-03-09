"""
Nutrient constants shared across the entire engine.

NUTRIENTS_V1 is the canonical ordered list for V1.
Each entry is (key, display_name, unit).
"""
from __future__ import annotations

NUTRIENTS_V1: list[tuple[str, str, str]] = [
    ("calories",    "Calories",      "kcal"),
    ("protein",     "Protein",       "g"),
    ("fat",         "Fat",           "g"),
    ("carbs",       "Carbohydrates", "g"),
    ("fiber",       "Fiber",         "g"),
    ("sugar",       "Sugar",         "g"),
    ("omega3",      "Omega-3",       "g"),
    ("caffeine",    "Caffeine",      "mg"),
    ("magnesium",   "Magnesium",     "mg"),
    ("potassium",   "Potassium",     "mg"),
    ("zinc",        "Zinc",          "mg"),
    ("iron",        "Iron",          "mg"),
    ("calcium",     "Calcium",       "mg"),
    ("selenium",    "Selenium",      "µg"),
    ("iodine",      "Iodine",        "µg"),
    ("choline",     "Choline",       "mg"),
    ("vitamin_d",   "Vitamin D",     "µg"),
    ("vitamin_b12", "Vitamin B12",   "µg"),
    ("biotin",      "Biotin",        "µg"),
    ("folate",      "Folate",        "µg"),
    ("vitamin_c",   "Vitamin C",     "mg"),
    # ── Fat-soluble vitamins ──────────────────────────────────────────────────
    ("vitamin_a",   "Vitamin A",     "µg"),
    ("vitamin_e",   "Vitamin E",     "mg"),
    ("vitamin_k",   "Vitamin K",     "µg"),
    # ── B-vitamin complex ─────────────────────────────────────────────────────
    ("vitamin_b1",  "Thiamine (B1)",        "mg"),
    ("vitamin_b2",  "Riboflavin (B2)",      "mg"),
    ("vitamin_b3",  "Niacin (B3)",          "mg"),
    ("vitamin_b5",  "Pant. Acid (B5)",      "mg"),
    ("vitamin_b6",  "Vitamin B6",           "mg"),
    # ── Trace minerals ────────────────────────────────────────────────────────
    ("copper",      "Copper",         "mg"),
    ("manganese",   "Manganese",      "mg"),
    ("chromium",    "Chromium",       "µg"),
    ("phosphorus",  "Phosphorus",     "mg"),
    # ── Additional limit nutrients ────────────────────────────────────────────
    ("sodium",        "Sodium",        "mg"),
    ("saturated_fat", "Saturated Fat", "g"),
]

# Nutrients where the target is a CEILING (max), not a floor (min).
# Going over these is bad; going under is good.
LIMIT_NUTRIENTS: set[str] = {"caffeine", "sugar", "sodium", "saturated_fat"}

NUTRIENT_KEYS: list[str] = [k for k, _, _ in NUTRIENTS_V1]
NUTRIENT_UNITS: dict[str, str] = {k: u for k, _, u in NUTRIENTS_V1}
NUTRIENT_LABELS: dict[str, str] = {k: n for k, n, _ in NUTRIENTS_V1}

# Default urgency weights (relative importance used by gap analysis / recommender).
# Scale 1-10, higher = more critical to meet.
NUTRIENT_URGENCY_WEIGHTS: dict[str, float] = {
    "calories":    9.0,
    "protein":     9.0,
    "fat":         5.0,
    "carbs":       5.0,
    "fiber":       7.0,
    "sugar":       7.0,
    "omega3":      6.0,
    "caffeine":    7.0,
    "magnesium":   7.0,
    "potassium":   7.0,
    "zinc":        6.0,
    "iron":        8.0,
    "calcium":     7.0,
    "selenium":    6.0,
    "iodine":      6.0,
    "choline":     6.0,
    "vitamin_d":   8.0,
    "vitamin_b12": 8.0,
    "biotin":      6.0,
    "folate":      7.0,
    "vitamin_c":   7.0,
    # Fat-soluble vitamins
    "vitamin_a":     7.0,
    "vitamin_e":     6.0,
    "vitamin_k":     6.0,
    # B-complex
    "vitamin_b1":    6.0,
    "vitamin_b2":    6.0,
    "vitamin_b3":    6.0,
    "vitamin_b5":    5.0,
    "vitamin_b6":    7.0,
    # Trace minerals
    "copper":        5.0,
    "manganese":     5.0,
    "chromium":      5.0,
    "phosphorus":    5.0,
    # Limit nutrients
    "sodium":        7.0,
    "saturated_fat": 7.0,
}


def empty_nutrients() -> dict[str, float]:
    """Return a zeroed nutrient map for V1 keys."""
    return {k: 0.0 for k in NUTRIENT_KEYS}


def add_nutrients(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    """Element-wise addition of two nutrient maps."""
    result = {k: a.get(k, 0.0) for k in NUTRIENT_KEYS}
    for k in NUTRIENT_KEYS:
        result[k] += b.get(k, 0.0)
    return result


def scale_nutrients(n: dict[str, float], factor: float) -> dict[str, float]:
    """Multiply all nutrient values by factor (for scaling serving sizes)."""
    return {k: v * factor for k, v in n.items()}
