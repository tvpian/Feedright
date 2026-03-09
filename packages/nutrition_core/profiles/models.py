"""User profile domain models."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import uuid


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ActivityLevel(str, Enum):
    SEDENTARY = "sedentary"          # desk job, minimal exercise
    LIGHT = "light"                  # 1-3 days light exercise / week
    MODERATE = "moderate"            # 3-5 days moderate / week
    ACTIVE = "active"                # 6-7 days hard exercise
    VERY_ACTIVE = "very_active"      # physical job + daily training


class GoalMode(str, Enum):
    """Legacy single-goal enum — still supported for backward compat."""
    MAINTENANCE = "maintenance"
    FAT_LOSS = "fat_loss"
    MUSCLE_GAIN = "muscle_gain"
    WELLNESS = "wellness"
    HAIR_SKIN = "hair_skin"
    HIGH_PROTEIN_RECOVERY = "high_protein_recovery"


# ── New multi-select enums ─────────────────────────────────────────────────────

class HealthGoal(str, Enum):
    """Users can select multiple goals — the engine blends them."""
    FAT_LOSS = "fat_loss"
    MUSCLE_GAIN = "muscle_gain"
    MAINTENANCE = "maintenance"
    LONGEVITY = "longevity"
    SKIN_HEALTH = "skin_health"
    HAIR_HEALTH = "hair_health"
    HIGH_ENERGY = "high_energy"
    IMMUNITY = "immunity"
    GUT_HEALTH = "gut_health"
    BONE_HEALTH = "bone_health"
    HEART_HEALTH = "heart_health"
    BRAIN_HEALTH = "brain_health"
    RECOVERY = "recovery"
    BETTER_SLEEP = "better_sleep"
    MOOD_BALANCE = "mood_balance"
    STRESS_MANAGEMENT = "stress_management"
    FOCUS = "focus"


class HealthCondition(str, Enum):
    """Medical / metabolic conditions that modify nutrient targets."""
    DIABETES_TYPE2 = "diabetes_type2"
    DIABETES_TYPE1 = "diabetes_type1"
    PREDIABETES = "prediabetes"
    PCOS = "pcos"
    HYPOTHYROID = "hypothyroid"
    HYPERTHYROID = "hyperthyroid"
    HIGH_BP = "high_bp"
    HIGH_CHOLESTEROL = "high_cholesterol"
    IRON_DEFICIENCY = "iron_deficiency"
    VITAMIN_D_DEFICIENCY = "vitamin_d_deficiency"
    B12_DEFICIENCY = "b12_deficiency"
    ANEMIA = "anemia"
    OSTEOPOROSIS = "osteoporosis"
    FATTY_LIVER = "fatty_liver"
    KIDNEY_STONES = "kidney_stones"


class DietaryPreference(str, Enum):
    NONE = "none"
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    PESCATARIAN = "pescatarian"
    GLUTEN_FREE = "gluten_free"
    DAIRY_FREE = "dairy_free"
    KETO = "keto"
    PALEO = "paleo"


@dataclass
class Supplement:
    """A supplement the user takes daily — nutrients it provides."""
    name: str
    daily_nutrients: dict[str, float] = field(default_factory=dict)
    # e.g. {"vitamin_d": 25.0, "omega3": 1.0}


@dataclass
class UserProfile:
    name: str
    age: int                                        # years
    sex: Sex
    weight_kg: float
    height_cm: float
    activity_level: ActivityLevel
    # Legacy single goal — still supported
    goal_mode: GoalMode = GoalMode.MAINTENANCE
    dietary_preferences: list[DietaryPreference] = field(default_factory=list)
    avoid_foods: list[str] = field(default_factory=list)   # food ids or tags
    supplement_ids: list[str] = field(default_factory=list)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    # ── New holistic fields ──
    health_goals: list[HealthGoal] = field(default_factory=list)
    health_conditions: list[HealthCondition] = field(default_factory=list)
    supplements: list[Supplement] = field(default_factory=list)

    # ---------- computed helpers ----------

    @property
    def bmr(self) -> float:
        """Mifflin-St Jeor basal metabolic rate (kcal/day)."""
        if self.sex == Sex.MALE:
            return 10 * self.weight_kg + 6.25 * self.height_cm - 5 * self.age + 5
        else:
            return 10 * self.weight_kg + 6.25 * self.height_cm - 5 * self.age - 161

    @property
    def tdee(self) -> float:
        """Total daily energy expenditure (TDEE) using activity multiplier."""
        multipliers = {
            ActivityLevel.SEDENTARY:   1.2,
            ActivityLevel.LIGHT:       1.375,
            ActivityLevel.MODERATE:    1.55,
            ActivityLevel.ACTIVE:      1.725,
            ActivityLevel.VERY_ACTIVE: 1.9,
        }
        return self.bmr * multipliers[self.activity_level]
