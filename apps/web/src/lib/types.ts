// ── Mirror of backend Pydantic schemas ────────────────────────────────────────

// ── Health / Profile enums ────────────────────────────────────────────────────

export const HEALTH_GOALS = [
  { value: "fat_loss",      label: "Fat Loss",             icon: "🔥" },
  { value: "muscle_gain",   label: "Muscle Gain",          icon: "💪" },
  { value: "maintenance",   label: "Maintenance",          icon: "⚖️" },
  { value: "longevity",     label: "Longevity",            icon: "🧬" },
  { value: "skin_health",   label: "Youthful Skin",        icon: "✨" },
  { value: "hair_health",   label: "Hair Health",          icon: "💇" },
  { value: "high_energy",   label: "High Energy",          icon: "⚡" },
  { value: "immunity",      label: "Immunity",             icon: "🛡️" },
  { value: "gut_health",    label: "Gut Health",           icon: "🦠" },
  { value: "bone_health",   label: "Bone Health",          icon: "🦴" },
  { value: "heart_health",  label: "Heart Health",         icon: "❤️" },
  { value: "brain_health",  label: "Brain Health",         icon: "🧠" },
  { value: "recovery",      label: "Recovery",             icon: "🏥" },
  { value: "better_sleep",  label: "Better Sleep",         icon: "😴" },
  { value: "mood_balance",  label: "Mood Balance",         icon: "😊" },
  { value: "stress_management", label: "Stress Management", icon: "🧘" },
  { value: "focus",         label: "Focus",                icon: "🎯" },
] as const;

export const HEALTH_CONDITIONS = [
  { value: "diabetes_type2",        label: "Type 2 Diabetes" },
  { value: "diabetes_type1",        label: "Type 1 Diabetes" },
  { value: "prediabetes",           label: "Pre-diabetes" },
  { value: "pcos",                  label: "PCOS" },
  { value: "hypothyroid",           label: "Hypothyroid" },
  { value: "hyperthyroid",          label: "Hyperthyroid" },
  { value: "high_bp",              label: "High Blood Pressure" },
  { value: "high_cholesterol",     label: "High Cholesterol" },
  { value: "iron_deficiency",      label: "Iron Deficiency" },
  { value: "vitamin_d_deficiency", label: "Vitamin D Deficiency" },
  { value: "b12_deficiency",       label: "B12 Deficiency" },
  { value: "anemia",               label: "Anemia" },
  { value: "osteoporosis",         label: "Osteoporosis" },
  { value: "fatty_liver",          label: "Fatty Liver" },
  { value: "kidney_stones",        label: "Kidney Stones" },
] as const;

export interface SupplementInput {
  name: string;
  daily_nutrients: Record<string, number>;
}

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  weight_kg: number;
  height_cm: number;
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal_mode: string;
  dietary_preferences: string[];
  avoid_foods: string[];
  supplement_ids: string[];
  // ── Holistic fields ──
  health_goals: string[];
  health_conditions: string[];
  supplements: SupplementInput[];
  has_pin?: boolean;
}

export interface ProfileCreate extends Omit<UserProfile, "id"> {}

export interface NutrientsPerServing {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  omega3: number;
  caffeine: number;
  magnesium: number;
  potassium: number;
  zinc: number;
  iron: number;
  calcium: number;
  selenium: number;
  iodine: number;
  choline: number;
  vitamin_d: number;
  vitamin_b12: number;
  biotin: number;
  folate: number;
  vitamin_c: number;
  // Fat-soluble vitamins
  vitamin_a?: number;
  vitamin_e?: number;
  vitamin_k?: number;
  // B-complex
  vitamin_b1?: number;
  vitamin_b2?: number;
  vitamin_b3?: number;
  vitamin_b5?: number;
  vitamin_b6?: number;
  // Trace minerals
  copper?: number;
  manganese?: number;
  chromium?: number;
  phosphorus?: number;
  // Limit nutrients
  sodium?: number;
  saturated_fat?: number;
}

export interface FoodItem {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  default_serving_g: number;
  default_unit: string;
  tags: string[];
  nutrients_per_100g: NutrientsPerServing;
  is_custom: boolean;
}

export interface LogEntry {
  id: string;
  user_id: string;
  log_date: string;
  food_id: string;
  amount_g: number;
  unit: string;
  meal_slot: string;
  saved_meal_id: string | null;
  notes: string;
  food_name?: string;
  food_default_serving_g?: number;
  food_default_unit?: string;
}

export interface LogEntryCreate {
  food_id: string;
  amount_g: number;
  unit?: string;
  meal_slot?: string;
  notes?: string;
}

export interface DailyLog {
  user_id: string;
  log_date: string;
  entries: LogEntry[];
  nutrient_totals: NutrientsPerServing;
}

export interface DailyTargets {
  user_id: string;
  targets: NutrientsPerServing;
  raw_targets?: NutrientsPerServing;   // before supplement offsets
}

export type NutrientStatus = "complete" | "close" | "low" | "critical";

export interface NutrientGap {
  key: string;
  target: number;
  consumed: number;
  percent_complete: number;
  deficit: number;
  status: NutrientStatus;
  urgency_score: number;
  is_limit: boolean;
}

export interface GapAnalysis {
  user_id: string;
  log_date: string;
  gaps: NutrientGap[];
  summary: string;
}

export interface NutrientContribution {
  key: string;
  gap_before: number;
  covered: number;
  gap_after: number;
  percent_of_gap_closed: number;
}

export interface FoodRecommendation {
  food: FoodItem;
  serving_g: number;
  score: number;
  estimated_calories: number;
  explanation: string;
  contributions: NutrientContribution[];
}

export interface ComboRecommendation {
  foods: FoodItem[];
  servings_g: number[];
  score: number;
  estimated_calories: number;
  explanation: string;
  contributions: NutrientContribution[];
}

export interface RecommendationResult {
  user_id: string;
  log_date: string;
  singles: FoodRecommendation[];
  combos: ComboRecommendation[];
}

export interface MealComponent {
  food_id: string;
  amount_g: number;
  unit: string;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  tags: string[];
  components: MealComponent[];
  total_calories?: number;
}

// ── Display helpers ────────────────────────────────────────────────────────────

export const NUTRIENT_LABELS: Record<string, string> = {
  calories:      "Calories",
  protein:       "Protein",
  fat:           "Fat",
  carbs:         "Carbohydrates",
  fiber:         "Fiber",
  sugar:         "Sugar",
  omega3:        "Omega-3",
  caffeine:      "Caffeine",
  magnesium:     "Magnesium",
  potassium:     "Potassium",
  zinc:          "Zinc",
  iron:          "Iron",
  calcium:       "Calcium",
  selenium:      "Selenium",
  iodine:        "Iodine",
  choline:       "Choline",
  vitamin_d:     "Vitamin D",
  vitamin_b12:   "Vitamin B12",
  biotin:        "Biotin",
  folate:        "Folate",
  vitamin_c:     "Vitamin C",
  // New – fat-soluble vitamins
  vitamin_a:     "Vitamin A",
  vitamin_e:     "Vitamin E",
  vitamin_k:     "Vitamin K",
  // New – B-complex
  vitamin_b1:    "Thiamine (B1)",
  vitamin_b2:    "Riboflavin (B2)",
  vitamin_b3:    "Niacin (B3)",
  vitamin_b5:    "Pant. Acid (B5)",
  vitamin_b6:    "Vitamin B6",
  // New – trace minerals
  copper:        "Copper",
  manganese:     "Manganese",
  chromium:      "Chromium",
  phosphorus:    "Phosphorus",
  // New – limit nutrients
  sodium:        "Sodium",
  saturated_fat: "Saturated Fat",
};

export const NUTRIENT_UNITS: Record<string, string> = {
  calories:      "kcal",
  protein:       "g",
  fat:           "g",
  carbs:         "g",
  fiber:         "g",
  sugar:         "g",
  omega3:        "g",
  caffeine:      "mg",
  magnesium:     "mg",
  potassium:     "mg",
  zinc:          "mg",
  iron:          "mg",
  calcium:       "mg",
  selenium:      "µg",
  iodine:        "µg",
  choline:       "mg",
  vitamin_d:     "µg",
  vitamin_b12:   "µg",
  biotin:        "µg",
  folate:        "µg",
  vitamin_c:     "mg",
  // New – fat-soluble vitamins
  vitamin_a:     "µg",
  vitamin_e:     "mg",
  vitamin_k:     "µg",
  // New – B-complex
  vitamin_b1:    "mg",
  vitamin_b2:    "mg",
  vitamin_b3:    "mg",
  vitamin_b5:    "mg",
  vitamin_b6:    "mg",
  // New – trace minerals
  copper:        "mg",
  manganese:     "mg",
  chromium:      "µg",
  phosphorus:    "mg",
  // New – limit nutrients
  sodium:        "mg",
  saturated_fat: "g",
};

/** Nutrients where the target is a ceiling (max) — not a floor (min). */
export const LIMIT_NUTRIENTS = new Set(["caffeine", "sugar", "sodium", "saturated_fat"]);

/** One-liner clinical explanation for each nutrient shown in the UI. */
export const NUTRIENT_DESCRIPTIONS: Record<string, string> = {
  // Macros
  calories:
    "Total energy from food. Your daily target is calibrated to your goal — deficit for fat loss, surplus for muscle gain, or balanced for maintenance.",
  protein:
    "The building block of muscle, skin, enzymes and hormones. Adequate intake repairs tissue, supports immunity and keeps you satiated longer.",
  fat:
    "Essential for absorbing fat-soluble vitamins (A, D, E, K), producing hormones and protecting the brain. Focus on unsaturated fats from fish, nuts and olive oil.",
  saturated_fat:
    "Excess saturated fat raises LDL cholesterol and cardiovascular risk. Limit by favouring lean meats, fish, nuts and plant-based oils.",
  carbs:
    "Your body's preferred fuel. Whole-food carbs (oats, legumes, vegetables) provide sustained energy; refined carbs cause blood-sugar spikes.",
  fiber:
    "Feeds beneficial gut bacteria, slows glucose absorption and reduces LDL cholesterol. Most people consume far less than the recommended 25–38 g/day.",
  sugar:
    "Added sugars spike blood glucose and contribute to insulin resistance over time. Natural sugars from whole fruit are far less concerning.",
  omega3:
    "Anti-inflammatory fatty acids (EPA/DHA) critical for heart health, brain function and joint flexibility. Best sources: oily fish, flaxseed and walnuts.",
  caffeine:
    "A stimulant that boosts alertness and exercise performance at moderate doses. High intake can disrupt sleep, raise blood pressure and cause dependency.",
  sodium:
    "Essential in small amounts for fluid balance and nerve conduction, but excess sodium — mainly from processed food — raises blood pressure significantly.",

  // Original vitamins
  vitamin_d:
    "Regulates calcium absorption for strong bones, modulates immunity and mood (linked to serotonin). Deficiency is extremely common due to limited sun exposure.",
  vitamin_b12:
    "Required for red blood cell formation, DNA synthesis and the myelin sheath that protects nerves. Largely absent from plant foods — vegans must supplement.",
  biotin:
    "A B-vitamin that supports keratin production (the protein in hair, skin and nails) and assists carbohydrate and fat metabolism.",
  folate:
    "Critical for DNA synthesis and cell division; prevents neural-tube defects in pregnancy. Also helps reduce homocysteine, a cardiovascular risk marker.",
  vitamin_c:
    "A potent antioxidant that builds collagen, enhances iron absorption and bolsters immune defences. Since it cannot be stored, daily intake is essential.",

  // Fat-soluble vitamins (new)
  vitamin_a:
    "Essential for night vision, immune-cell differentiation and skin-cell turnover. Comes as retinol (liver, dairy) or beta-carotene (carrots, sweet potato).",
  vitamin_e:
    "A fat-soluble antioxidant that protects cell membranes from oxidative damage; also supports immune function and healthy skin.",
  vitamin_k:
    "Activates clotting proteins (K1) and directs calcium into bones rather than arteries (K2). Critical for bone density and cardiovascular protection.",

  // B-complex (new)
  vitamin_b1:
    "Thiamine converts carbohydrates into usable energy and supports nerve and muscle function. Deficiency causes fatigue and, severely, neurological damage (beriberi).",
  vitamin_b2:
    "Riboflavin drives energy metabolism in every cell and helps regenerate glutathione — the body's most important antioxidant.",
  vitamin_b3:
    "Niacin is involved in 400+ enzyme reactions including DNA repair and energy production. High therapeutic doses raise HDL and lower triglycerides.",
  vitamin_b5:
    "Pantothenic acid is the core of coenzyme A, which runs every step of fatty-acid synthesis and the Krebs energy cycle.",
  vitamin_b6:
    "Supports 100+ enzymes including amino-acid metabolism and the synthesis of neurotransmitters (serotonin, dopamine, GABA) and immune-cell production.",

  // Original minerals
  magnesium:
    "Cofactor in 300+ enzyme reactions: energy production, protein synthesis, muscle contraction and blood-sugar regulation. Deficiency is linked to anxiety and poor sleep.",
  potassium:
    "Counterbalances sodium — a high-potassium diet lowers blood pressure, supports kidney health and prevents muscle cramps.",
  zinc:
    "Essential for immune defence, wound healing, testosterone production, taste/smell perception and DNA repair. Depleted quickly by stress and heavy exercise.",
  iron:
    "Carries oxygen in haemoglobin (blood) and myoglobin (muscle). Iron-deficiency anaemia is the world's most common nutritional disorder, causing fatigue and brain fog.",
  calcium:
    "The primary mineral in bones and teeth; also regulates muscle contractions, nerve transmission and blood clotting. Absorption depends on adequate vitamin D.",
  selenium:
    "Integrated into antioxidant enzymes (glutathione peroxidase) and required for the conversion of inactive thyroid hormone (T4) to active T3.",
  iodine:
    "The raw material for thyroid hormones that regulate metabolism, growth and brain development. Deficiency is the leading preventable cause of intellectual disability worldwide.",
  choline:
    "Precursor to acetylcholine (memory, muscle control) and phosphatidylcholine (cell membranes). Critical for fetal brain development; most people fall short.",

  // Trace minerals (new)
  copper:
    "Required for iron absorption into red blood cells, collagen cross-linking, myelin synthesis and the antioxidant enzyme SOD. Pairs closely with zinc.",
  manganese:
    "Needed for bone matrix formation, carbohydrate metabolism and as the cofactor for Mn-SOD — the main mitochondrial antioxidant enzyme.",
  chromium:
    "Potentiates insulin signalling, improving glucose uptake by cells. Especially relevant for blood-sugar management in diabetes and prediabetes.",
  phosphorus:
    "Second most abundant mineral in the body — forms the backbone of DNA/RNA, ATP (cellular energy currency) and the mineral matrix of bone and teeth.",
};

export const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack", "Other"];

// ── Weight Tracker ────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: string;
  user_id: string;
  log_date: string;
  weight_kg: number;
  notes: string;
}

export interface WeightEntryCreate {
  weight_kg: number;
  log_date?: string;
  notes?: string;
}

// ── What-If Preview ───────────────────────────────────────────────────────────

export interface WhatIfGap {
  key: string;
  before_pct: number;
  after_pct: number;
  delta_pct: number;
  is_limit: boolean;
}

export interface WhatIfResponse {
  food_name: string;
  calories_added: number;
  gaps: WhatIfGap[];
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export interface FavoriteFood {
  food_id: string;
  food_name: string;
  count: number;
  last_logged: string;
}

// ── Analytics / Trends ────────────────────────────────────────────────────────

export interface DailyNutrientSnapshot {
  log_date: string;
  nutrient_totals: Record<string, number>;
  calorie_total: number;
}

export interface TrendResponse {
  user_id: string;
  days: number;
  snapshots: DailyNutrientSnapshot[];
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  total_logged_days: number;
  last_logged_date: string | null;
}

export interface WeeklyAverages {
  user_id: string;
  days: number;
  averages: Record<string, number>;
  low_nutrients: string[];
}

// ── Common Supplements Reference ──────────────────────────────────────────────

export interface CommonSupplement {
  key: string;
  label: string;
  daily_nutrients: Record<string, number>;
}

/** Pluralise a unit label: "piece" → "pieces", "cup" → "cups" etc. */
function pluralUnit(unit: string, n: number): string {
  if (n === 1) return unit;
  if (unit.endsWith("s")) return unit;
  return unit + "s";
}

/**
 * Format an amount for display.
 * If the food has a countable unit (piece, cup, tbsp, etc.) show e.g. "2 pieces (100g)".
 * Otherwise just "150g".
 */
export function formatAmount(amount_g: number, food?: FoodItem | null): string {
  if (!food || food.default_unit === "g" || food.default_serving_g <= 0) {
    return `${Math.round(amount_g)}g`;
  }
  const count = amount_g / food.default_serving_g;
  // Only show unit form if it divides evenly-ish (within 5%)
  const rounded = Math.round(count * 2) / 2; // round to nearest 0.5
  if (rounded > 0 && Math.abs(count - rounded) / count < 0.05) {
    const label = rounded === 0.5
      ? `½ ${food.default_unit}`
      : `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} ${pluralUnit(food.default_unit, rounded)}`;
    return `${label} (${Math.round(amount_g)}g)`;
  }
  return `${Math.round(amount_g)}g`;
}

/**
 * Format a log entry's amount using the denormalized food info.
 * Shows e.g. "2 pieces (100g)" for countable foods, or just "150g".
 */
export function formatEntryAmount(entry: LogEntry): string {
  const g = entry.amount_g;
  const servG = entry.food_default_serving_g;
  const unit = entry.food_default_unit;

  if (!unit || unit === "g" || !servG || servG <= 0) {
    return `${Math.round(g)}g`;
  }

  const count = g / servG;
  const rounded = Math.round(count * 2) / 2;
  if (rounded > 0 && Math.abs(count - rounded) / Math.max(count, 0.01) < 0.05) {
    const label = rounded === 0.5
      ? `½ ${unit}`
      : `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} ${rounded === 1 ? unit : (unit.endsWith("s") ? unit : unit + "s")}`;
    return `${label} (${Math.round(g)}g)`;
  }
  return `${Math.round(g)}g`;
}
