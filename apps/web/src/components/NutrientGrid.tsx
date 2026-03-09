"use client";

import type { GapAnalysis, LogEntry, FoodItem } from "@/lib/types";
import { NUTRIENT_LABELS, NUTRIENT_UNITS, LIMIT_NUTRIENTS, NUTRIENT_DESCRIPTIONS } from "@/lib/types";
import { NutrientBar } from "./NutrientBar";

interface Props {
  gaps: GapAnalysis["gaps"];
  compact?: boolean;
  showOnlyIncomplete?: boolean;
  entries?: LogEntry[];        // today's log entries for deep-dive
  foodMap?: Record<string, FoodItem>;  // food_id → FoodItem for nutrient breakdown
}

// Display order: macros → limit nutrients → vitamins → minerals
const ORDERED_KEYS = [
  // Macros
  "calories", "protein", "fat", "saturated_fat", "carbs", "fiber", "sugar",
  // Limit / other
  "caffeine", "sodium", "omega3",
  // Vitamins (original)
  "vitamin_d", "vitamin_b12", "biotin", "folate", "vitamin_c",
  // Fat-soluble vitamins (new)
  "vitamin_a", "vitamin_e", "vitamin_k",
  // B-complex (new)
  "vitamin_b1", "vitamin_b2", "vitamin_b3", "vitamin_b5", "vitamin_b6",
  // Minerals (original)
  "magnesium", "potassium", "zinc", "iron", "calcium", "selenium", "iodine", "choline",
  // Trace minerals (new)
  "copper", "manganese", "chromium", "phosphorus",
];

export function NutrientGrid({ gaps, compact, showOnlyIncomplete, entries, foodMap }: Props) {
  const gapMap = Object.fromEntries(gaps.map((g) => [g.key, g]));

  const keys = ORDERED_KEYS.filter((k) => {
    const g = gapMap[k];
    if (!g) return false;
    if (showOnlyIncomplete) {
      // For limit nutrients: hide only if status is 'complete' (well under limit)
      // For floor nutrients: hide if status is 'complete'
      if (g.status === "complete") return false;
    }
    return true;
  });

  // Pre-compute per-food contributions for deep-dive
  function getContributions(nutrientKey: string) {
    if (!entries || !foodMap) return undefined;
    const contribs: { food_name: string; amount_g: number; nutrient_value: number }[] = [];
    for (const entry of entries) {
      const food = foodMap[entry.food_id];
      if (!food) continue;
      const per100 = (food.nutrients_per_100g as any)[nutrientKey] ?? 0;
      const val = (per100 * entry.amount_g) / 100;
      if (val > 0) {
        contribs.push({
          food_name: entry.food_name || food.name,
          amount_g: entry.amount_g,
          nutrient_value: val,
        });
      }
    }
    return contribs.sort((a, b) => b.nutrient_value - a.nutrient_value);
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const g = gapMap[key];
        return (
          <NutrientBar
            key={key}
            label={NUTRIENT_LABELS[key] ?? key}
            unit={NUTRIENT_UNITS[key] ?? ""}
            consumed={g.consumed}
            target={g.target}
            status={g.status}
            compact={compact}
            nutrientKey={key}
            contributions={getContributions(key)}
            isLimit={g.is_limit ?? LIMIT_NUTRIENTS.has(key)}
            description={NUTRIENT_DESCRIPTIONS[key]}
          />
        );
      })}
    </div>
  );
}
