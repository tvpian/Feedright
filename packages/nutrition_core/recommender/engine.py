"""
Deterministic recommendation engine.

Algorithm
─────────
1. For each food in the library, compute a single score:
      score = coverage_score
            + density_bonus
            - calorie_penalty
            - friction_penalty
            + preference_bonus
            - restriction_penalty

2. Rank individual foods → top-N singles.

3. Generate pair combos from top-N singles, score pairs (additive coverage).

4. Return ranked singles + combos with per-item explanations.

All scoring is deterministic and config-driven — no randomness, no ML.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Optional

from nutrition_core.analysis.engine import GapAnalysis, NutrientStatus
from nutrition_core.constants import (
    LIMIT_NUTRIENTS,
    NUTRIENT_KEYS,
    NUTRIENT_URGENCY_WEIGHTS,
    add_nutrients,
    empty_nutrients,
    scale_nutrients,
)
from nutrition_core.food_db.models import FoodItem


# ── Scoring weights (config-driven via dataclass) ─────────────────────────────

@dataclass
class ScoringConfig:
    coverage_weight: float     = 10.0   # multiplier for urgency × coverage fraction
    density_bonus_weight: float= 2.0    # protein density bonus
    calorie_penalty_weight: float = 0.005  # per kcal penalty
    friction_penalty: float    = 3.0    # flat penalty for "needs cooking" tag
    preference_bonus: float    = 2.0    # flat bonus for preferred foods
    top_n_for_combos: int      = 12     # how many singles feed into pair generation
    max_combos: int            = 10     # max combo results returned


DEFAULT_CONFIG = ScoringConfig()


# ── Request / result types ─────────────────────────────────────────────────────

@dataclass
class RecommendationRequest:
    gap_analysis: GapAnalysis
    food_library: dict[str, FoodItem]       # available foods (food_id → FoodItem)
    avoid_ids: list[str] = field(default_factory=list)
    avoid_tags: list[str] = field(default_factory=list)
    preferred_tags: list[str] = field(default_factory=list)
    require_tags: list[str] = field(default_factory=list)  # only include foods having at least one of these tags
    max_calories: Optional[float] = None   # hard calorie ceiling on results
    constraints: list[str] = field(default_factory=list)   # e.g. "no-cook", "vegetarian"
    config: ScoringConfig = field(default_factory=lambda: DEFAULT_CONFIG)


@dataclass
class NutrientContribution:
    key: str
    gap_before: float
    covered: float           # additional amount this food provides
    gap_after: float
    percent_of_gap_closed: float


@dataclass
class FoodRecommendation:
    food: FoodItem
    serving_g: float
    score: float
    contributions: list[NutrientContribution]
    estimated_calories: float
    explanation: str


@dataclass
class ComboRecommendation:
    foods: list[FoodItem]
    servings_g: list[float]
    score: float
    contributions: list[NutrientContribution]
    estimated_calories: float
    explanation: str


@dataclass
class RecommendationResult:
    singles: list[FoodRecommendation]
    combos: list[ComboRecommendation]


# ── Core scoring helpers ───────────────────────────────────────────────────────

def _serving_nutrients(food: FoodItem) -> dict[str, float]:
    return food.nutrients_for_serving()


def _coverage_score(
    nutrients: dict[str, float],
    gap: GapAnalysis,
    config: ScoringConfig,
) -> float:
    """How well does this food address open deficits?

    Floor nutrients: reward coverage of deficits.
    Limit nutrients: penalise foods that push over the ceiling.
    """
    score = 0.0
    for key in NUTRIENT_KEYS:
        gap_entry = gap.gaps.get(key)
        if gap_entry is None:
            continue

        if key in LIMIT_NUTRIENTS:
            # Penalise pushing limit nutrients toward/over ceiling
            available = nutrients.get(key, 0.0)
            if available > 0 and gap_entry.target > 0:
                # How much of the remaining headroom does this food consume?
                remaining = max(gap_entry.target - gap_entry.consumed, 0.0)
                if remaining <= 0:
                    # Already over limit — any more is penalised heavily
                    score -= available / gap_entry.target * NUTRIENT_URGENCY_WEIGHTS.get(key, 5.0) * config.coverage_weight * 0.5
                elif available > remaining:
                    # Would push over limit
                    overshoot = available - remaining
                    score -= overshoot / gap_entry.target * NUTRIENT_URGENCY_WEIGHTS.get(key, 5.0) * config.coverage_weight * 0.3
            continue

        # Floor nutrients: reward filling deficits
        if gap_entry.status == NutrientStatus.COMPLETE:
            continue
        deficit = gap_entry.deficit
        if deficit <= 0:
            continue
        available = nutrients.get(key, 0.0)
        coverage_fraction = min(available / deficit, 1.0)
        urgency = NUTRIENT_URGENCY_WEIGHTS.get(key, 5.0)
        score += coverage_fraction * urgency * config.coverage_weight
    return score


def _score_food(
    food: FoodItem,
    nutrients: dict[str, float],
    gap: GapAnalysis,
    request: RecommendationRequest,
) -> float:
    config = request.config
    score = _coverage_score(nutrients, gap, config)

    # Protein density bonus
    kcal = nutrients.get("calories", 0.0)
    protein = nutrients.get("protein", 0.0)
    if kcal > 0:
        score += (protein / kcal) * 100 * config.density_bonus_weight

    # Calorie penalty (prefer lower-calorie options when gap is not about calories)
    score -= kcal * config.calorie_penalty_weight

    # Friction: "needs-cooking" tag → penalty
    if "needs-cooking" in food.tags:
        score -= config.friction_penalty

    # Preference bonus
    for tag in request.preferred_tags:
        if tag in food.tags:
            score += config.preference_bonus
            break

    return score


def _build_contributions(
    nutrients: dict[str, float],
    gap: GapAnalysis,
) -> list[NutrientContribution]:
    contribs = []
    for key in NUTRIENT_KEYS:
        gap_entry = gap.gaps[key]
        if gap_entry.deficit <= 0:
            continue
        covered = min(nutrients.get(key, 0.0), gap_entry.deficit)
        if covered <= 0:
            continue
        gap_after = max(gap_entry.deficit - covered, 0.0)
        pct = (covered / gap_entry.deficit * 100.0) if gap_entry.deficit > 0 else 0.0
        contribs.append(NutrientContribution(
            key=key,
            gap_before=gap_entry.deficit,
            covered=covered,
            gap_after=gap_after,
            percent_of_gap_closed=pct,
        ))
    contribs.sort(key=lambda c: -c.percent_of_gap_closed)
    return contribs


def _make_explanation(food_names: list[str], contribs: list[NutrientContribution]) -> str:
    top = contribs[:4]
    if not top:
        return f"{' + '.join(food_names)}: provides general nutrition."
    parts = [f"{c.key} ({c.percent_of_gap_closed:.0f}% of gap)" for c in top]
    return f"{' + '.join(food_names)} covers: {', '.join(parts)}."


# ── Filtering helpers ──────────────────────────────────────────────────────────

# Tags that indicate animal-flesh foods
_MEAT_TAGS = frozenset({"meat", "poultry", "fish", "seafood"})
# Tags that indicate any animal-derived product
_ANIMAL_TAGS = frozenset({"meat", "poultry", "fish", "seafood", "dairy", "egg"})
# Categories that are inherently non-vegetarian (fallback when tags are sparse)
_NON_VEG_CATEGORIES = frozenset({"protein"})  # protein category = meat/fish/eggs


# Name patterns that should be excluded from recommendations
# (baby food, formulas, supplements, powders, diet shakes, freeze-dried concentrates)
_EXCLUDE_FROM_RECS_PATTERNS = frozenset({
    "baby", "infant", "formula", "gerber", "babyfood",
    "protein supplement", "shake mix", "slimfast", "slim-fast",
    "freeze-dried", "freeze dried", "dehydrated",
    "nutrition bar", "energy bar", "protein bar",
    "meal replacement", "not reconstituted",
})

# Categories that are not useful as standalone meal recommendations
_LOW_QUALITY_CATEGORIES = frozenset({"other"})


def _is_allowed(food: FoodItem, request: RecommendationRequest) -> bool:
    if food.id in request.avoid_ids:
        return False
    for tag in request.avoid_tags:
        if tag in food.tags:
            return False

    tags = set(food.tags)
    name_lower = food.name.lower()

    # ── Quality gate: exclude baby food, formulas, etc. ──
    if any(pat in name_lower for pat in _EXCLUDE_FROM_RECS_PATTERNS):
        return False

    # Exclude "other" category unless it was hand-curated (no fdc: tag)
    if food.category == "other" and any(t.startswith("fdc:") for t in food.tags):
        return False

    # ── Cuisine / require_tags filter ──
    if request.require_tags:
        if not (tags & set(request.require_tags)):
            return False

    for constraint in request.constraints:
        if constraint == "vegetarian":
            if tags & _MEAT_TAGS:
                return False
            if food.category == "protein" and not (tags & {"egg", "dairy", "legume", "vegan", "vegetarian"}):
                return False

        elif constraint == "no-cook":
            if "needs-cooking" in tags:
                return False

        elif constraint == "vegan":
            if tags & _ANIMAL_TAGS:
                return False
            if food.category in ("protein", "dairy") and not (tags & {"legume", "vegan"}):
                return False

    return True


# ── Main entry point ───────────────────────────────────────────────────────────

def recommend(request: RecommendationRequest) -> RecommendationResult:
    """
    Return ranked food singles + pair combos based on current nutrient gaps.
    """
    config = request.config
    gap = request.gap_analysis

    # Build candidate list
    candidates: list[tuple[FoodItem, dict[str, float], float]] = []
    for food in request.food_library.values():
        if not _is_allowed(food, request):
            continue
        nutrients = _serving_nutrients(food)
        kcal = nutrients.get("calories", 0.0)
        if request.max_calories is not None and kcal > request.max_calories:
            continue
        score = _score_food(food, nutrients, gap, request)
        candidates.append((food, nutrients, score))

    candidates.sort(key=lambda x: -x[2])

    # ── Singles ──
    singles: list[FoodRecommendation] = []
    for food, nutrients, score in candidates:
        contribs = _build_contributions(nutrients, gap)
        singles.append(FoodRecommendation(
            food=food,
            serving_g=food.default_serving_g,
            score=score,
            contributions=contribs,
            estimated_calories=nutrients.get("calories", 0.0),
            explanation=_make_explanation([food.name], contribs),
        ))

    # ── Combos ──
    top_n = candidates[:config.top_n_for_combos]
    combos: list[ComboRecommendation] = []
    for (fa, na, sa), (fb, nb, sb) in itertools.combinations(top_n, 2):
        combined = add_nutrients(na, nb)
        kcal_combined = combined.get("calories", 0.0)
        if request.max_calories is not None and kcal_combined > request.max_calories:
            continue
        # Re-score the combo on combined nutrients
        pair_score = _coverage_score(combined, gap, config)
        contribs = _build_contributions(combined, gap)
        combos.append(ComboRecommendation(
            foods=[fa, fb],
            servings_g=[fa.default_serving_g, fb.default_serving_g],
            score=pair_score,
            contributions=contribs,
            estimated_calories=kcal_combined,
            explanation=_make_explanation([fa.name, fb.name], contribs),
        ))

    combos.sort(key=lambda c: -c.score)

    return RecommendationResult(
        singles=singles,
        combos=combos[:config.max_combos],
    )
