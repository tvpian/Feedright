"""
Deterministic daily nutrient target computation.

Supports two modes:
  1. Legacy single goal_mode (backward compat)
  2. Holistic mode: blended health_goals + health_conditions + supplements

Targets are derived from:
  - the user's TDEE (Mifflin-St Jeor)
  - their goals (one or many)
  - medical/metabolic conditions that adjust nutrient needs
  - supplements already taken (subtracted from targets)
  - established DRI / RDA values
"""
from __future__ import annotations

from dataclasses import dataclass

from nutrition_core.constants import LIMIT_NUTRIENTS
from nutrition_core.profiles.models import (
    ActivityLevel,
    GoalMode,
    HealthCondition,
    HealthGoal,
    Sex,
    Supplement,
    UserProfile,
)


@dataclass
class DailyTargets:
    """All per-day nutrient targets for a user."""
    calories: float
    protein: float          # g
    fat: float              # g
    carbs: float            # g
    fiber: float            # g
    sugar: float            # g  (daily MAX)
    omega3: float           # g
    caffeine: float         # mg (daily MAX)
    magnesium: float        # mg
    potassium: float        # mg
    zinc: float             # mg
    iron: float             # mg
    calcium: float          # mg
    selenium: float         # µg
    iodine: float           # µg
    choline: float          # mg
    vitamin_d: float        # µg
    vitamin_b12: float      # µg
    biotin: float           # µg
    folate: float           # µg DFE
    vitamin_c: float        # mg
    # ── Fat-soluble vitamins ──────────────────────────────────────────────────
    vitamin_a: float        # µg RAE
    vitamin_e: float        # mg
    vitamin_k: float        # µg
    # ── B-vitamin complex ───────────────────────────────────────────────────────
    vitamin_b1: float       # mg thiamine
    vitamin_b2: float       # mg riboflavin
    vitamin_b3: float       # mg NE niacin
    vitamin_b5: float       # mg pantothenic acid
    vitamin_b6: float       # mg
    # ── Trace minerals ────────────────────────────────────────────────────────
    copper: float           # mg
    manganese: float        # mg
    chromium: float         # µg
    phosphorus: float       # mg
    # ── Limit nutrients ──────────────────────────────────────────────────────────
    sodium: float           # mg  (daily MAX)
    saturated_fat: float    # g   (daily MAX)

    def as_dict(self) -> dict[str, float]:
        return {
            "calories":    self.calories,
            "protein":     self.protein,
            "fat":         self.fat,
            "carbs":       self.carbs,
            "fiber":       self.fiber,
            "sugar":       self.sugar,
            "omega3":      self.omega3,
            "caffeine":    self.caffeine,
            "magnesium":   self.magnesium,
            "potassium":   self.potassium,
            "zinc":        self.zinc,
            "iron":        self.iron,
            "calcium":     self.calcium,
            "selenium":    self.selenium,
            "iodine":      self.iodine,
            "choline":     self.choline,
            "vitamin_d":   self.vitamin_d,
            "vitamin_b12": self.vitamin_b12,
            "biotin":      self.biotin,
            "folate":      self.folate,
            "vitamin_c":   self.vitamin_c,
            "vitamin_a":   self.vitamin_a,
            "vitamin_e":   self.vitamin_e,
            "vitamin_k":   self.vitamin_k,
            "vitamin_b1":  self.vitamin_b1,
            "vitamin_b2":  self.vitamin_b2,
            "vitamin_b3":  self.vitamin_b3,
            "vitamin_b5":  self.vitamin_b5,
            "vitamin_b6":  self.vitamin_b6,
            "copper":      self.copper,
            "manganese":   self.manganese,
            "chromium":    self.chromium,
            "phosphorus":  self.phosphorus,
            "sodium":      self.sodium,
            "saturated_fat": self.saturated_fat,
        }


# ══════════════════════════════════════════════════════════════════════════════
# LEGACY — single goal_mode tables (still used when health_goals is empty)
# ══════════════════════════════════════════════════════════════════════════════

_MACRO_SPLITS: dict[GoalMode, tuple[float, float, float]] = {
    GoalMode.MAINTENANCE:            (0.25, 0.30, 0.45),
    GoalMode.FAT_LOSS:               (0.35, 0.30, 0.35),
    GoalMode.MUSCLE_GAIN:            (0.30, 0.25, 0.45),
    GoalMode.WELLNESS:               (0.25, 0.30, 0.45),
    GoalMode.HAIR_SKIN:              (0.25, 0.35, 0.40),
    GoalMode.HIGH_PROTEIN_RECOVERY:  (0.40, 0.25, 0.35),
}

_CALORIE_ADJUSTMENTS: dict[GoalMode, float] = {
    GoalMode.MAINTENANCE:           0.0,
    GoalMode.FAT_LOSS:             -500.0,
    GoalMode.MUSCLE_GAIN:          +300.0,
    GoalMode.WELLNESS:               0.0,
    GoalMode.HAIR_SKIN:              0.0,
    GoalMode.HIGH_PROTEIN_RECOVERY: +200.0,
}

_LEGACY_MICRO_MULTS: dict[GoalMode, dict[str, float]] = {
    GoalMode.HAIR_SKIN: {
        "biotin": 1.5, "iron": 1.3, "zinc": 1.3, "selenium": 1.2,
        "vitamin_d": 1.3, "vitamin_b12": 1.2, "folate": 1.2,
        "omega3": 1.3, "vitamin_c": 1.3,
        "vitamin_a": 1.3, "copper": 1.4, "vitamin_b2": 1.2, "vitamin_b5": 1.3,
    },
    GoalMode.HIGH_PROTEIN_RECOVERY: {
        "zinc": 1.2, "vitamin_c": 1.2, "magnesium": 1.15,
        "vitamin_b6": 1.3, "vitamin_b3": 1.2, "phosphorus": 1.2,
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# HOLISTIC — per-goal macro & micro adjustments
# ══════════════════════════════════════════════════════════════════════════════

# Each goal defines: calorie offset, macro split (protein%, fat%, carb%),
# and micro boosts expressed as *multipliers* on the base DRI (1.0 = no change).
_GOAL_PROFILES: dict[HealthGoal, dict] = {
    HealthGoal.MAINTENANCE: {
        "cal_offset": 0, "macros": (0.25, 0.30, 0.45), "micro_mult": {},
    },
    HealthGoal.FAT_LOSS: {
        "cal_offset": -500, "macros": (0.35, 0.30, 0.35), "micro_mult": {
            "chromium": 1.3,          # improves insulin sensitivity / fat metab
        },
    },
    HealthGoal.MUSCLE_GAIN: {
        "cal_offset": +300, "macros": (0.32, 0.25, 0.43), "micro_mult": {
            "zinc": 1.2, "magnesium": 1.15,
            "vitamin_b6": 1.2, "phosphorus": 1.2,
            "vitamin_b3": 1.15, "vitamin_b2": 1.15,
        },
    },
    HealthGoal.RECOVERY: {
        "cal_offset": +200, "macros": (0.38, 0.25, 0.37), "micro_mult": {
            "zinc": 1.3, "vitamin_c": 1.3, "magnesium": 1.2,
            "vitamin_b6": 1.3, "vitamin_b3": 1.2,
            "copper": 1.2, "phosphorus": 1.2, "manganese": 1.15,
        },
    },
    HealthGoal.LONGEVITY: {
        "cal_offset": -100, "macros": (0.25, 0.32, 0.43), "micro_mult": {
            "omega3": 1.5, "selenium": 1.2, "vitamin_d": 1.3,
            "vitamin_c": 1.4, "magnesium": 1.15, "folate": 1.2,
            "vitamin_e": 1.4, "vitamin_a": 1.2, "vitamin_k": 1.3,
            "vitamin_b6": 1.2, "manganese": 1.2,
        },
    },
    HealthGoal.SKIN_HEALTH: {
        "cal_offset": 0, "macros": (0.25, 0.35, 0.40), "micro_mult": {
            "omega3": 1.5, "vitamin_c": 1.6, "vitamin_d": 1.3,
            "zinc": 1.3, "selenium": 1.3, "vitamin_b12": 1.2, "biotin": 1.2,
            "vitamin_a": 1.5, "vitamin_e": 1.6,
            "vitamin_b2": 1.3, "vitamin_b3": 1.4, "vitamin_b5": 1.3,
            "saturated_fat": 0.85,
        },
    },
    HealthGoal.HAIR_HEALTH: {
        "cal_offset": 0, "macros": (0.28, 0.32, 0.40), "micro_mult": {
            "iron": 1.4, "zinc": 1.4, "selenium": 1.2, "vitamin_d": 1.3,
            "vitamin_b12": 1.3, "biotin": 1.6, "folate": 1.3, "omega3": 1.3,
            "vitamin_a": 1.3, "copper": 1.5,
            "vitamin_b2": 1.3, "vitamin_b5": 1.4, "vitamin_b6": 1.2,
        },
    },
    HealthGoal.HIGH_ENERGY: {
        "cal_offset": +100, "macros": (0.25, 0.28, 0.47), "micro_mult": {
            "iron": 1.3, "vitamin_b12": 1.3, "magnesium": 1.2,
            "vitamin_b1": 1.4, "vitamin_b2": 1.3, "vitamin_b3": 1.4,
            "vitamin_b5": 1.3, "vitamin_b6": 1.3, "chromium": 1.2,
        },
    },
    HealthGoal.IMMUNITY: {
        "cal_offset": 0, "macros": (0.25, 0.30, 0.45), "micro_mult": {
            "vitamin_c": 1.8, "vitamin_d": 1.5, "zinc": 1.5,
            "selenium": 1.3, "iron": 1.1, "folate": 1.2,
            "vitamin_a": 1.5, "vitamin_e": 1.4, "vitamin_b6": 1.3, "copper": 1.2,
        },
    },
    HealthGoal.GUT_HEALTH: {
        "cal_offset": 0, "macros": (0.23, 0.30, 0.47), "micro_mult": {
            "fiber": 1.4, "magnesium": 1.15, "potassium": 1.1,
            "vitamin_b5": 1.2, "manganese": 1.2,
        },
    },
    HealthGoal.BONE_HEALTH: {
        "cal_offset": 0, "macros": (0.25, 0.30, 0.45), "micro_mult": {
            "calcium": 1.3, "vitamin_d": 1.6, "magnesium": 1.2, "potassium": 1.1,
            "vitamin_k": 1.6, "phosphorus": 1.3, "copper": 1.3,
            "manganese": 1.4, "vitamin_a": 1.2,
        },
    },
    HealthGoal.HEART_HEALTH: {
        "cal_offset": -100, "macros": (0.22, 0.33, 0.45), "micro_mult": {
            "omega3": 1.8, "potassium": 1.3, "magnesium": 1.3,
            "fiber": 1.3, "folate": 1.2,
            "vitamin_k": 1.3, "vitamin_e": 1.3, "vitamin_b6": 1.3,
            "sodium": 0.65, "saturated_fat": 0.65,
        },
    },
    HealthGoal.BRAIN_HEALTH: {
        "cal_offset": 0, "macros": (0.25, 0.35, 0.40), "micro_mult": {
            "omega3": 1.8, "choline": 1.4, "vitamin_b12": 1.3,
            "folate": 1.3, "iron": 1.1, "magnesium": 1.15,
            "vitamin_b1": 1.3, "vitamin_b2": 1.2, "vitamin_b3": 1.3,
            "vitamin_b6": 1.4, "copper": 1.2, "vitamin_e": 1.3,
        },
    },
    HealthGoal.BETTER_SLEEP: {
        "cal_offset": 0, "macros": (0.25, 0.30, 0.45), "micro_mult": {
            "magnesium": 1.5, "calcium": 1.2, "potassium": 1.15,
            "vitamin_d": 1.3, "vitamin_b12": 1.2,
            "vitamin_b6": 1.3,           # melatonin precursor via serotonin
            "sodium": 0.75,
            "caffeine": 0.50,
            "sugar": 0.60,
        },
    },
    HealthGoal.MOOD_BALANCE: {
        "cal_offset": 0, "macros": (0.25, 0.33, 0.42), "micro_mult": {
            "omega3": 1.6, "vitamin_d": 1.5, "vitamin_b12": 1.4,
            "magnesium": 1.35, "folate": 1.4, "iron": 1.2, "zinc": 1.15,
            "vitamin_b6": 1.5,           # serotonin / GABA synthesis
            "vitamin_b3": 1.2, "vitamin_b1": 1.2,
            "sugar": 0.70,
        },
    },
    HealthGoal.STRESS_MANAGEMENT: {
        "cal_offset": 0, "macros": (0.25, 0.30, 0.45), "micro_mult": {
            "magnesium": 1.5, "omega3": 1.4, "vitamin_c": 1.5,
            "vitamin_b12": 1.3, "potassium": 1.15, "zinc": 1.2,
            "vitamin_b5": 1.5,           # adrenal support, cortisol synthesis
            "vitamin_b6": 1.4, "vitamin_b3": 1.2,
            "caffeine": 0.75,
            "sugar": 0.70,
        },
    },
    HealthGoal.FOCUS: {
        "cal_offset": 0, "macros": (0.25, 0.33, 0.42), "micro_mult": {
            "omega3": 1.6, "choline": 1.5, "iron": 1.25,
            "vitamin_b12": 1.3, "magnesium": 1.2, "folate": 1.2,
            "vitamin_b1": 1.3, "vitamin_b3": 1.3, "vitamin_b6": 1.3, "copper": 1.2,
            "caffeine": 0.75,
        },
    },
}


# ── Per-condition adjustments (multipliers on base DRI) ────────────────────────

_CONDITION_ADJUSTMENTS: dict[HealthCondition, dict] = {
    HealthCondition.DIABETES_TYPE2: {
        "carb_mult": 0.70,      # reduce carbs by ~30%
        "fiber_mult": 1.4,      # high fiber critical
        "micro_mult": {
            "magnesium": 1.3, "chromium": 1.6, "zinc": 1.2,
            "vitamin_d": 1.3, "omega3": 1.3,
            "vitamin_b1": 1.3,            # T2D depletes thiamine
            "sodium": 0.75, "saturated_fat": 0.75,
            "sugar": 0.50, "caffeine": 0.75,
        },
    },
    HealthCondition.DIABETES_TYPE1: {
        "carb_mult": 0.80,
        "fiber_mult": 1.3,
        "micro_mult": {
            "magnesium": 1.2, "vitamin_d": 1.3, "omega3": 1.2,
            "vitamin_b1": 1.2,
            "sodium": 0.80, "saturated_fat": 0.80,
            "sugar": 0.60,
        },
    },
    HealthCondition.PREDIABETES: {
        "carb_mult": 0.80,
        "fiber_mult": 1.3,
        "micro_mult": {
            "magnesium": 1.2, "fiber": 1.2,
            "chromium": 1.4, "vitamin_b6": 1.2,
            "sodium": 0.85, "saturated_fat": 0.85,
            "sugar": 0.60,
        },
    },
    HealthCondition.PCOS: {
        "carb_mult": 0.75,
        "micro_mult": {
            "omega3": 1.3, "vitamin_d": 1.4, "zinc": 1.2,
            "magnesium": 1.2, "folate": 1.3, "iron": 1.2,
            "vitamin_b6": 1.4, "vitamin_k": 1.2, "chromium": 1.3,
        },
    },
    HealthCondition.HYPOTHYROID: {
        "micro_mult": {
            "iodine": 1.5, "selenium": 1.5, "zinc": 1.3,
            "iron": 1.2, "vitamin_d": 1.3,
            "vitamin_a": 1.2,             # beta-carotene conversion impaired
            "vitamin_e": 1.2,             # antioxidant for thyroid tissue
            "vitamin_b2": 1.2,            # cofactor in T3/T4 metabolism
        },
    },
    HealthCondition.HYPERTHYROID: {
        "micro_mult": {
            "calcium": 1.3, "vitamin_d": 1.3, "selenium": 1.3,
            "phosphorus": 1.1,            # bone protection
        },
    },
    HealthCondition.HIGH_BP: {
        "micro_mult": {
            "potassium": 1.4, "magnesium": 1.3, "calcium": 1.2, "omega3": 1.3,
            "sodium": 0.50,               # ~1150 mg/day ceiling
            "saturated_fat": 0.80,
            "caffeine": 0.50,
        },
    },
    HealthCondition.HIGH_CHOLESTEROL: {
        "micro_mult": {
            "omega3": 1.5, "fiber": 1.4, "folate": 1.2,
            "vitamin_b3": 1.2,            # niacin for LDL/HDL
            "vitamin_e": 1.3,             # LDL oxidation protection
            "saturated_fat": 0.60,
        },
    },
    HealthCondition.IRON_DEFICIENCY: {
        "micro_mult": {
            "iron": 1.8, "vitamin_c": 1.5, "folate": 1.3, "vitamin_b12": 1.3,
            "vitamin_b6": 1.3,            # heme synthesis
            "copper": 1.4,               # ceruloplasmin / ferroxidase
        },
    },
    HealthCondition.VITAMIN_D_DEFICIENCY: {
        "micro_mult": {
            "vitamin_d": 2.0, "calcium": 1.2, "magnesium": 1.15,
        },
    },
    HealthCondition.B12_DEFICIENCY: {
        "micro_mult": {
            "vitamin_b12": 2.0, "folate": 1.3, "iron": 1.2,
        },
    },
    HealthCondition.ANEMIA: {
        "micro_mult": {
            "iron": 2.0, "vitamin_c": 1.5, "vitamin_b12": 1.5, "folate": 1.5,
            "vitamin_b6": 1.4,            # sideroblastic anemia prevention
            "copper": 1.5,               # ferroxidase activity
        },
    },
    HealthCondition.OSTEOPOROSIS: {
        "micro_mult": {
            "calcium": 1.5, "vitamin_d": 2.0, "magnesium": 1.3, "potassium": 1.2,
            "vitamin_k": 1.8,             # activates osteocalcin
            "phosphorus": 1.3,
            "copper": 1.3,               # collagen cross-linking in bone matrix
            "manganese": 1.4,
        },
    },
    HealthCondition.FATTY_LIVER: {
        "carb_mult": 0.75,
        "micro_mult": {
            "choline": 1.4, "omega3": 1.4, "vitamin_d": 1.2,
            "saturated_fat": 0.60,
            "sodium": 0.80,
        },
    },
    HealthCondition.KIDNEY_STONES: {
        "micro_mult": {
            "potassium": 1.3, "magnesium": 1.2,
            "sodium": 0.70,               # high Na -> urinary Ca excretion
            "phosphorus": 0.85,           # reduce phosphate load
        },
    },
}


# ── Common supplements and what they provide per day ──────────────────────────────────────────────

COMMON_SUPPLEMENTS: dict[str, dict[str, float]] = {
    # Vitamin D
    "vitamin_d_1000iu":       {"vitamin_d": 25.0},
    "vitamin_d_2000iu":       {"vitamin_d": 50.0},
    "vitamin_d_5000iu":       {"vitamin_d": 125.0},
    # Omega-3
    "fish_oil_1000mg":        {"omega3": 0.3},
    "fish_oil_2000mg":        {"omega3": 0.6},
    "omega3_epa_dha":         {"omega3": 0.9},
    # Vitamin B12
    "vitamin_b12_1000mcg":    {"vitamin_b12": 1000.0},
    "vitamin_b12_sublingual": {"vitamin_b12": 500.0},
    # Minerals
    "iron_65mg":              {"iron": 65.0},
    "calcium_600mg":          {"calcium": 600.0},
    "calcium_with_d":         {"calcium": 600.0, "vitamin_d": 10.0},
    "magnesium_400mg":        {"magnesium": 400.0},
    "magnesium_glycinate":    {"magnesium": 200.0},
    "zinc_50mg":              {"zinc": 50.0},
    "zinc_15mg":              {"zinc": 15.0},
    "copper_2mg":             {"copper": 2.0},
    "chromium_200mcg":        {"chromium": 200.0},
    # Vitamins
    "vitamin_c_500mg":        {"vitamin_c": 500.0},
    "vitamin_c_1000mg":       {"vitamin_c": 1000.0},
    "vitamin_a_5000iu":       {"vitamin_a": 1500.0},   # 5000 IU = 1500 µg RAE
    "vitamin_e_400iu":        {"vitamin_e": 268.0},    # 400 IU = 268 mg alpha-toc
    "vitamin_k2_100mcg":      {"vitamin_k": 100.0},
    "folate_400mcg":          {"folate": 400.0},
    "biotin_5000mcg":         {"biotin": 5000.0},
    "selenium_200mcg":        {"selenium": 200.0},
    "iodine_150mcg":          {"iodine": 150.0},
    "vitamin_b6_50mg":        {"vitamin_b6": 50.0},
    # B-complex
    "vitamin_b_complex":      {
        "vitamin_b1": 5.0, "vitamin_b2": 5.0, "vitamin_b3": 20.0,
        "vitamin_b5": 10.0, "vitamin_b6": 5.0,
    },
    # Multivitamin (expanded to track all new nutrients)
    "multivitamin_basic":     {
        "vitamin_d": 15.0, "vitamin_b12": 6.0, "vitamin_c": 90.0,
        "iron": 8.0, "zinc": 8.0, "selenium": 55.0,
        "folate": 400.0, "calcium": 200.0, "magnesium": 100.0,
        "iodine": 150.0, "biotin": 30.0,
        "vitamin_a": 900.0, "vitamin_e": 15.0, "vitamin_k": 75.0,
        "vitamin_b1": 1.2, "vitamin_b2": 1.3, "vitamin_b3": 16.0,
        "vitamin_b5": 5.0, "vitamin_b6": 1.7,
        "copper": 0.9, "manganese": 2.3, "chromium": 35.0,
    },
    # Adaptogens & protein (no direct nutrient mapping)
    "ashwagandha":            {},
    "collagen_peptides":      {"protein": 10.0},
    "whey_protein_scoop":     {"protein": 25.0, "calcium": 100.0},
    "creatine_5g":            {},
    "probiotics":             {},
}


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY — compute_targets
# ══════════════════════════════════════════════════════════════════════════════

def compute_targets(profile: UserProfile) -> DailyTargets:
    """Return deterministic daily nutrient targets for a user profile.

    If profile.health_goals is populated, uses holistic blending.
    Otherwise falls back to the legacy single goal_mode path.
    """
    if profile.health_goals:
        return _compute_holistic(profile)
    return _compute_legacy(profile)


def _compute_legacy(profile: UserProfile) -> DailyTargets:
    """Original single-goal path — backward compat."""
    base_kcal = profile.tdee + _CALORIE_ADJUSTMENTS[profile.goal_mode]
    base_kcal = max(base_kcal, 1200.0 if profile.sex == Sex.FEMALE else 1500.0)

    p_pct, f_pct, c_pct = _MACRO_SPLITS[profile.goal_mode]
    protein_g = (base_kcal * p_pct) / 4.0
    fat_g     = (base_kcal * f_pct) / 9.0
    carbs_g   = (base_kcal * c_pct) / 4.0
    fiber_g   = min(max(base_kcal / 1000 * 14, 25.0), 38.0)

    male = profile.sex == Sex.MALE
    targets = _base_micros(male, base_kcal, protein_g, fat_g, carbs_g, fiber_g)
    legacy_mults = _LEGACY_MICRO_MULTS.get(profile.goal_mode, {})
    if legacy_mults:
        d = targets.as_dict()
        for nutrient, mult in legacy_mults.items():
            if nutrient in d:
                d[nutrient] *= mult
        targets = DailyTargets(**d)
    targets = _apply_supplement_offsets(targets, profile.supplements)
    return targets


def _compute_holistic(profile: UserProfile) -> DailyTargets:
    """Blended computation from multiple goals + conditions + supplements."""
    goals = profile.health_goals
    conditions = profile.health_conditions
    male = profile.sex == Sex.MALE

    # ── 1. Blend calorie offsets (average of all goals) ──────────────────
    cal_offsets = [_GOAL_PROFILES[g]["cal_offset"] for g in goals if g in _GOAL_PROFILES]
    avg_cal_offset = sum(cal_offsets) / len(cal_offsets) if cal_offsets else 0
    base_kcal = profile.tdee + avg_cal_offset
    base_kcal = max(base_kcal, 1200.0 if profile.sex == Sex.FEMALE else 1500.0)

    # ── 2. Blend macro splits (weighted average across goals) ────────────
    macro_entries = [_GOAL_PROFILES[g]["macros"] for g in goals if g in _GOAL_PROFILES]
    if macro_entries:
        p_pct = sum(m[0] for m in macro_entries) / len(macro_entries)
        f_pct = sum(m[1] for m in macro_entries) / len(macro_entries)
        c_pct = sum(m[2] for m in macro_entries) / len(macro_entries)
    else:
        p_pct, f_pct, c_pct = 0.25, 0.30, 0.45

    # Apply condition-based carb multiplier (take the lowest)
    carb_mult = 1.0
    for cond in conditions:
        adj = _CONDITION_ADJUSTMENTS.get(cond, {})
        if "carb_mult" in adj:
            carb_mult = min(carb_mult, adj["carb_mult"])

    # Redistribute: reduce carbs, give half the freed % to protein, half to fat
    if carb_mult < 1.0:
        freed = c_pct * (1.0 - carb_mult)
        c_pct *= carb_mult
        p_pct += freed * 0.6   # bias toward protein
        f_pct += freed * 0.4

    # Normalize so they sum to 1.0
    total = p_pct + f_pct + c_pct
    p_pct, f_pct, c_pct = p_pct / total, f_pct / total, c_pct / total

    protein_g = (base_kcal * p_pct) / 4.0
    fat_g     = (base_kcal * f_pct) / 9.0
    carbs_g   = (base_kcal * c_pct) / 4.0
    fiber_g   = min(max(base_kcal / 1000 * 14, 25.0), 38.0)

    # Apply condition fiber multiplier
    fiber_mult = 1.0
    for cond in conditions:
        adj = _CONDITION_ADJUSTMENTS.get(cond, {})
        if "fiber_mult" in adj:
            fiber_mult = max(fiber_mult, adj["fiber_mult"])
    fiber_g *= fiber_mult

    # ── 3. Compute base micros ───────────────────────────────────────────
    targets_dict = _base_micros_dict(male, base_kcal, protein_g, fat_g, carbs_g, fiber_g)

    # ── 4. Apply goal-based micro multipliers (take max for each nutrient)
    goal_micro_mults: dict[str, float] = {}
    for g in goals:
        gp = _GOAL_PROFILES.get(g, {})
        for nutrient, mult in gp.get("micro_mult", {}).items():
            if nutrient in targets_dict:
                if nutrient in LIMIT_NUTRIENTS:
                    # For limit nutrients take the MINIMUM (most restrictive ceiling)
                    goal_micro_mults[nutrient] = min(
                        goal_micro_mults.get(nutrient, 1.0), mult
                    )
                else:
                    goal_micro_mults[nutrient] = max(
                        goal_micro_mults.get(nutrient, 1.0), mult
                    )

    for nutrient, mult in goal_micro_mults.items():
        targets_dict[nutrient] *= mult

    # ── 5. Apply condition-based micro multipliers (take max)
    cond_micro_mults: dict[str, float] = {}
    for cond in conditions:
        adj = _CONDITION_ADJUSTMENTS.get(cond, {})
        for nutrient, mult in adj.get("micro_mult", {}).items():
            if nutrient in targets_dict:
                if nutrient in LIMIT_NUTRIENTS:
                    cond_micro_mults[nutrient] = min(
                        cond_micro_mults.get(nutrient, 1.0), mult
                    )
                else:
                    cond_micro_mults[nutrient] = max(
                        cond_micro_mults.get(nutrient, 1.0), mult
                    )

    for nutrient, mult in cond_micro_mults.items():
        targets_dict[nutrient] *= mult

    # ── 6. Subtract supplement contributions ─────────────────────────────
    targets = DailyTargets(**targets_dict)
    targets = _apply_supplement_offsets(targets, profile.supplements)
    return targets


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _base_micros(male: bool, calories: float, protein: float, fat: float,
                 carbs: float, fiber: float) -> DailyTargets:
    """Return DailyTargets with sex-based DRI/RDA micronutrient values."""
    return DailyTargets(**_base_micros_dict(male, calories, protein, fat, carbs, fiber))


def _base_micros_dict(male: bool, calories: float, protein: float, fat: float,
                      carbs: float, fiber: float) -> dict[str, float]:
    """Return a dict of base nutrient targets (DRI/RDA based)."""
    return {
        "calories":    calories,
        "protein":     protein,
        "fat":         fat,
        "carbs":       carbs,
        "fiber":       fiber,
        "sugar":       50.0,                                 # g max (WHO total sugars guideline)
        "omega3":      1.6 if male else 1.1,               # g AI
        "caffeine":    400.0,                                # mg max (FDA healthy adults)
        "magnesium":   420.0 if male else 320.0,            # mg RDA
        "potassium":   3400.0 if male else 2600.0,          # mg AI
        "zinc":        11.0 if male else 8.0,               # mg RDA
        "iron":        8.0 if male else 18.0,               # mg RDA
        "calcium":     1000.0,                               # mg RDA 19-50
        "selenium":    55.0,                                 # µg RDA
        "iodine":      150.0,                                # µg RDA
        "choline":     550.0 if male else 425.0,             # mg AI
        "vitamin_d":   15.0,                                 # µg RDA
        "vitamin_b12": 2.4,                                  # µg RDA
        "biotin":      30.0,                                 # µg AI
        "folate":      400.0,                                # µg DFE RDA
        "vitamin_c":   90.0 if male else 75.0,              # mg RDA
        # Fat-soluble vitamins
        "vitamin_a":     900.0 if male else 700.0,          # µg RAE RDA
        "vitamin_e":     15.0,                               # mg RDA alpha-toc
        "vitamin_k":     120.0 if male else 90.0,            # µg AI
        # B-vitamin complex
        "vitamin_b1":    1.2 if male else 1.1,               # mg RDA thiamine
        "vitamin_b2":    1.3 if male else 1.1,               # mg RDA riboflavin
        "vitamin_b3":    16.0 if male else 14.0,             # mg NE RDA niacin
        "vitamin_b5":    5.0,                                 # mg AI pantothenic
        "vitamin_b6":    1.3,                                 # mg RDA (adults ≤50)
        # Trace minerals
        "copper":        0.9,                                 # mg RDA
        "manganese":     2.3 if male else 1.8,               # mg AI
        "chromium":      35.0 if male else 25.0,             # µg AI
        "phosphorus":    700.0,                               # mg RDA
        # Limit nutrients
        "sodium":        2300.0,                              # mg UL max (DGA)
        "saturated_fat": 22.0,                               # g max (~10%kcal/2200)
    }


def _apply_supplement_offsets(targets: DailyTargets, supplements: list[Supplement]) -> DailyTargets:
    """Reduce targets by what supplements already provide.

    Never reduce below 20% of original target (you still need food-sourced nutrients).
    """
    if not supplements:
        return targets

    d = targets.as_dict()
    original = dict(d)
    for supp in supplements:
        for nutrient, amount in supp.daily_nutrients.items():
            if nutrient in d and nutrient != "calories":  # never subtract from calorie target
                d[nutrient] = max(d[nutrient] - amount, original[nutrient] * 0.2)

    return DailyTargets(**d)

