"""Tests for the nutrition_core package."""
import pytest
from datetime import date

# ── helpers ───────────────────────────────────────────────────────────────────

def _make_food(name, calories, protein=0, fat=0, carbs=0, fiber=0, **micro):
    """Create a minimal FoodItem for testing."""
    from nutrition_core.food_db.models import FoodItem
    from nutrition_core.constants import empty_nutrients
    n = empty_nutrients()
    n.update(dict(calories=calories, protein=protein, fat=fat,
                  carbs=carbs, fiber=fiber, **micro))
    return FoodItem(
        name=name,
        category="test",
        default_serving_g=100.0,
        default_unit="g",
        nutrients_per_100g=n,
        tags=[],
    )


def _make_profile():
    from nutrition_core.profiles.models import (
        UserProfile, Sex, ActivityLevel, GoalMode
    )
    return UserProfile(
        name="Test User",
        age=30,
        sex=Sex.MALE,
        weight_kg=80.0,
        height_cm=180.0,
        activity_level=ActivityLevel.MODERATE,
        goal_mode=GoalMode.MAINTENANCE,
    )


# ── profile / targets ─────────────────────────────────────────────────────────

class TestProfileBMR:
    def test_male_bmr_sanity(self):
        p = _make_profile()
        assert 1700 < p.bmr < 2000

    def test_tdee_greater_than_bmr(self):
        p = _make_profile()
        assert p.tdee > p.bmr


class TestTargetComputation:
    def test_calorie_target_reasonable(self):
        from nutrition_core.targets.engine import compute_targets
        p = _make_profile()
        t = compute_targets(p)
        assert 1800 < t.calories < 3500

    def test_macro_calories_sum(self):
        from nutrition_core.targets.engine import compute_targets
        p = _make_profile()
        t = compute_targets(p)
        macro_kcal = t.protein * 4 + t.fat * 9 + t.carbs * 4
        # Should be within 5% of calorie target
        assert abs(macro_kcal - t.calories) / t.calories < 0.05

    def test_fat_loss_less_calories(self):
        from nutrition_core.profiles.models import GoalMode
        from nutrition_core.targets.engine import compute_targets
        from copy import copy
        p = _make_profile()
        from dataclasses import replace
        p_fat = replace(p, goal_mode=GoalMode.FAT_LOSS)
        p_main = replace(p, goal_mode=GoalMode.MAINTENANCE)
        assert compute_targets(p_fat).calories < compute_targets(p_main).calories

    def test_targets_dict_has_all_keys(self):
        from nutrition_core.targets.engine import compute_targets
        from nutrition_core.constants import NUTRIENT_KEYS
        t = compute_targets(_make_profile())
        for key in NUTRIENT_KEYS:
            assert key in t.as_dict()

    def test_hair_health_increases_biotin_target(self):
        from dataclasses import replace

        from nutrition_core.profiles.models import HealthGoal
        from nutrition_core.targets.engine import compute_targets

        base = compute_targets(_make_profile())
        hair = compute_targets(replace(_make_profile(), health_goals=[HealthGoal.HAIR_HEALTH]))

        assert hair.biotin > base.biotin


# ── food scaling ──────────────────────────────────────────────────────────────

class TestFoodScaling:
    def test_default_serving_nutrients(self):
        food = _make_food("Chicken", calories=165, protein=31)
        n = food.nutrients_for_serving()
        assert n["calories"] == pytest.approx(165.0)
        assert n["protein"] == pytest.approx(31.0)

    def test_half_serving(self):
        food = _make_food("Chicken", calories=200, protein=40)
        n = food.nutrients_for_serving(50.0)   # 50 g = half of 100 g
        assert n["calories"] == pytest.approx(100.0)
        assert n["protein"] == pytest.approx(20.0)

    def test_double_serving(self):
        food = _make_food("Rice", calories=130, carbs=28)
        n = food.nutrients_for_serving(200.0)
        assert n["calories"] == pytest.approx(260.0)
        assert n["carbs"] == pytest.approx(56.0)


# ── ledger aggregation ────────────────────────────────────────────────────────

class TestLedgerAggregation:
    def test_aggregate_two_entries(self):
        from nutrition_core.ledger.models import LogEntry, DailyLog
        from nutrition_core.ledger.aggregator import aggregate_nutrients

        chicken = _make_food("Chicken", calories=165, protein=31)
        rice = _make_food("Rice", calories=130, carbs=28)
        food_map = {chicken.id: chicken, rice.id: rice}

        log = DailyLog(user_id="u1", log_date=date.today())
        log.add(LogEntry(user_id="u1", log_date=date.today(),
                         food_id=chicken.id, amount_g=100))
        log.add(LogEntry(user_id="u1", log_date=date.today(),
                         food_id=rice.id, amount_g=100))

        totals = aggregate_nutrients(log, food_map)
        assert totals["calories"] == pytest.approx(165 + 130)
        assert totals["protein"] == pytest.approx(31.0)
        assert totals["carbs"] == pytest.approx(28.0)

    def test_unknown_food_skipped(self):
        from nutrition_core.ledger.models import LogEntry, DailyLog
        from nutrition_core.ledger.aggregator import aggregate_nutrients

        log = DailyLog(user_id="u1", log_date=date.today())
        log.add(LogEntry(user_id="u1", log_date=date.today(),
                         food_id="nonexistent", amount_g=100))
        totals = aggregate_nutrients(log, {})
        assert totals["calories"] == 0.0

    def test_scaled_entry(self):
        from nutrition_core.ledger.models import LogEntry, DailyLog
        from nutrition_core.ledger.aggregator import aggregate_nutrients

        egg = _make_food("Egg", calories=155, protein=13)
        food_map = {egg.id: egg}
        log = DailyLog(user_id="u1", log_date=date.today())
        log.add(LogEntry(user_id="u1", log_date=date.today(),
                         food_id=egg.id, amount_g=60))  # 0.6 × 100 g
        totals = aggregate_nutrients(log, food_map)
        assert totals["calories"] == pytest.approx(155 * 0.6)


# ── gap analysis ──────────────────────────────────────────────────────────────

class TestGapAnalysis:
    def _targets(self, calories=2000):
        from nutrition_core.targets.engine import compute_targets
        return compute_targets(_make_profile())

    def test_complete_when_at_target(self):
        from nutrition_core.analysis.engine import analyze_gaps, NutrientStatus
        from nutrition_core.constants import NUTRIENT_KEYS, LIMIT_NUTRIENTS
        t = self._targets()
        consumed = t.as_dict()   # exactly at target
        result = analyze_gaps(consumed, t)
        for key in NUTRIENT_KEYS:
            if key in LIMIT_NUTRIENTS:
                # At 100% of ceiling => near-limit (LOW)
                assert result.gaps[key].status == NutrientStatus.LOW
            else:
                assert result.gaps[key].status == NutrientStatus.COMPLETE

    def test_critical_when_zero(self):
        from nutrition_core.analysis.engine import analyze_gaps, NutrientStatus
        from nutrition_core.constants import empty_nutrients, LIMIT_NUTRIENTS
        t = self._targets()
        result = analyze_gaps(empty_nutrients(), t)
        # Floor nutrients at zero => critical
        assert result.gaps["calories"].status == NutrientStatus.CRITICAL
        # Limit nutrients at zero => complete (well under ceiling)
        for key in LIMIT_NUTRIENTS:
            assert result.gaps[key].status == NutrientStatus.COMPLETE

    def test_close_at_90_percent(self):
        from nutrition_core.analysis.engine import analyze_gaps, NutrientStatus
        t = self._targets()
        consumed = {k: v * 0.90 for k, v in t.as_dict().items()}
        result = analyze_gaps(consumed, t)
        assert result.gaps["calories"].status == NutrientStatus.CLOSE

    def test_sorted_by_urgency(self):
        from nutrition_core.analysis.engine import analyze_gaps
        from nutrition_core.constants import empty_nutrients
        t = self._targets()
        result = analyze_gaps(empty_nutrients(), t)
        sorted_gaps = result.sorted_by_urgency()
        scores = [g.urgency_score for g in sorted_gaps]
        assert scores == sorted(scores, reverse=True)


# ── recommender ───────────────────────────────────────────────────────────────

class TestRecommender:
    def _setup(self):
        from nutrition_core.analysis.engine import analyze_gaps
        from nutrition_core.constants import empty_nutrients
        from nutrition_core.targets.engine import compute_targets

        profile = _make_profile()
        targets = compute_targets(profile)
        gap = analyze_gaps(empty_nutrients(), targets)

        salmon = _make_food("Salmon", calories=208, protein=28, fat=12,
                            vitamin_d=16.0, omega3=2.5)
        spinach = _make_food("Spinach", calories=23, protein=3, fiber=2,
                             magnesium=79, folate=194)
        rice = _make_food("Brown Rice", calories=111, carbs=23, fiber=2)
        chicken = _make_food("Chicken Breast", calories=165, protein=31, fat=4)

        foods = {f.id: f for f in [salmon, spinach, rice, chicken]}
        return gap, foods

    def test_returns_singles(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        gap, foods = self._setup()
        result = recommend(RecommendationRequest(gap_analysis=gap, food_library=foods))
        assert len(result.singles) > 0

    def test_returns_combos(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        gap, foods = self._setup()
        result = recommend(RecommendationRequest(gap_analysis=gap, food_library=foods))
        assert len(result.combos) > 0

    def test_calorie_ceiling_respected(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        gap, foods = self._setup()
        result = recommend(RecommendationRequest(
            gap_analysis=gap,
            food_library=foods,
            max_calories=50.0,
        ))
        for rec in result.singles:
            assert rec.estimated_calories <= 50.0

    def test_avoid_id_excluded(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        gap, foods = self._setup()
        all_ids = list(foods.keys())
        result = recommend(RecommendationRequest(
            gap_analysis=gap,
            food_library=foods,
            avoid_ids=all_ids,
        ))
        assert result.singles == []

    def test_no_cook_constraint(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        from nutrition_core.food_db.models import FoodItem
        from nutrition_core.constants import empty_nutrients

        gap, foods = self._setup()
        # Add a "needs-cooking" food
        n = empty_nutrients()
        n["calories"] = 300
        steak = FoodItem(name="Steak", category="meat",
                         default_serving_g=100, default_unit="g",
                         nutrients_per_100g=n, tags=["needs-cooking", "meat"])
        foods2 = {**foods, steak.id: steak}

        result = recommend(RecommendationRequest(
            gap_analysis=gap,
            food_library=foods2,
            constraints=["no-cook"],
        ))
        for rec in result.singles:
            assert "needs-cooking" not in rec.food.tags

    def test_singles_sorted_by_score(self):
        from nutrition_core.recommender.engine import recommend, RecommendationRequest
        gap, foods = self._setup()
        result = recommend(RecommendationRequest(gap_analysis=gap, food_library=foods))
        scores = [r.score for r in result.singles]
        assert scores == sorted(scores, reverse=True)


# ── saved meal ────────────────────────────────────────────────────────────────

class TestSavedMeal:
    def test_total_nutrients(self):
        from nutrition_core.food_db.models import SavedMeal, MealComponent

        chicken = _make_food("Chicken", calories=165, protein=31)
        rice = _make_food("Rice", calories=130, carbs=28)
        food_map = {chicken.id: chicken, rice.id: rice}

        meal = SavedMeal(name="Lunch", user_id="u1", components=[
            MealComponent(food_id=chicken.id, amount_g=150),
            MealComponent(food_id=rice.id, amount_g=200),
        ])

        totals = meal.total_nutrients(food_map)
        assert totals["calories"] == pytest.approx(165 * 1.5 + 130 * 2.0)
        assert totals["protein"] == pytest.approx(31 * 1.5)


# ── food search ───────────────────────────────────────────────────────────────

class TestFoodSearch:
    def test_finds_by_name(self):
        from nutrition_core.food_db.search import search_foods

        chicken = _make_food("Chicken Breast", 165)
        salmon = _make_food("Atlantic Salmon", 208)
        foods = {f.id: f for f in [chicken, salmon]}

        results = search_foods("chicken", foods)
        assert len(results) == 1
        assert results[0].name == "Chicken Breast"

    def test_empty_query_returns_all(self):
        from nutrition_core.food_db.search import search_foods

        foods = {f.id: f for f in [_make_food("A", 100), _make_food("B", 100)]}
        results = search_foods("", foods)
        assert len(results) == 2

    def test_finds_by_alias(self):
        from nutrition_core.food_db.search import search_foods
        from nutrition_core.food_db.models import FoodItem
        from nutrition_core.constants import empty_nutrients

        food = FoodItem(name="Greek Yogurt", category="dairy",
                        default_serving_g=150, default_unit="g",
                        nutrients_per_100g=empty_nutrients(),
                        aliases=["yoghurt", "strained yogurt"])
        foods = {food.id: food}
        results = search_foods("yoghurt", foods)
        assert len(results) == 1
