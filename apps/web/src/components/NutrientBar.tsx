"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { NutrientStatus, LogEntry } from "@/lib/types";
import { LIMIT_NUTRIENTS } from "@/lib/types";

interface FoodContribution {
  food_name: string;
  amount_g: number;
  nutrient_value: number;
}

interface Props {
  label: string;
  unit: string;
  consumed: number;
  target: number;
  status: NutrientStatus;
  compact?: boolean;
  nutrientKey?: string;
  contributions?: FoodContribution[];
  isLimit?: boolean;
  description?: string;
}

// Floor nutrients: green = met, red = critical deficit
const FLOOR_BAR: Record<NutrientStatus, string> = {
  complete: "bg-brand-500",
  close:    "bg-yellow-400",
  low:      "bg-orange-400",
  critical: "bg-red-500",
};
const FLOOR_TEXT: Record<NutrientStatus, string> = {
  complete: "text-brand-700 bg-brand-50",
  close:    "text-yellow-700 bg-yellow-50",
  low:      "text-orange-700 bg-orange-50",
  critical: "text-red-700 bg-red-50",
};
const FLOOR_LABEL: Record<NutrientStatus, string> = {
  complete: "Met",
  close:    "Close",
  low:      "Low",
  critical: "Critical",
};

// Limit nutrients: green = well under, red = over limit
const LIMIT_BAR: Record<NutrientStatus, string> = {
  complete: "bg-emerald-400",
  close:    "bg-amber-400",
  low:      "bg-orange-500",
  critical: "bg-red-600",
};
const LIMIT_TEXT: Record<NutrientStatus, string> = {
  complete: "text-emerald-700 bg-emerald-50",
  close:    "text-amber-700 bg-amber-50",
  low:      "text-orange-700 bg-orange-50",
  critical: "text-red-700 bg-red-50",
};
const LIMIT_LABEL: Record<NutrientStatus, string> = {
  complete: "OK",
  close:    "Watch",
  low:      "Near Limit",
  critical: "Over!",
};

export function NutrientBar({ label, unit, consumed, target, status, compact, nutrientKey, contributions, isLimit, description }: Props) {
  const pct = Math.min((consumed / target) * 100, 100);
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown = contributions && contributions.length > 0;
  const isExpandable = hasBreakdown || !!description;
  const isLimitNutrient = isLimit ?? (nutrientKey ? LIMIT_NUTRIENTS.has(nutrientKey) : false);

  const barColor   = isLimitNutrient ? LIMIT_BAR   : FLOOR_BAR;
  const textColor  = isLimitNutrient ? LIMIT_TEXT   : FLOOR_TEXT;
  const labelMap   = isLimitNutrient ? LIMIT_LABEL  : FLOOR_LABEL;
  const barLabel   = isLimitNutrient ? "max" : "";

  return (
    <div className={clsx("w-full", compact ? "space-y-0.5" : "space-y-1")}>
      <button
        type="button"
        onClick={() => isExpandable && setExpanded(!expanded)}
        className={clsx("w-full text-left", isExpandable && "cursor-pointer")}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={clsx("font-medium", compact ? "text-xs" : "text-sm")}>
            {isLimitNutrient && <span className="text-[10px] mr-1">⬆</span>}
            {label}
            {isExpandable && <span className="text-gray-300 ml-1 text-[10px]">{expanded ? "▲" : "▼"}</span>}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={clsx("text-xs", compact ? "text-[10px]" : "")}>
              {fmt(consumed)}{unit} / {fmt(target)}{unit}{barLabel && ` ${barLabel}`}
            </span>
            <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", textColor[status])}>
              {labelMap[status]}
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full overflow-hidden mt-0.5 relative" style={{ height: compact ? 5 : 8 }}>
          <div
            className={clsx("h-full rounded-full transition-all duration-500", barColor[status])}
            style={{ width: `${pct}%` }}
          />
          {/* For limit nutrients, show a thin marker at 100% */}
          {isLimitNutrient && consumed > 0 && (
            <div className="absolute right-0 top-0 w-0.5 h-full bg-red-800 opacity-40" />
          )}
        </div>
      </button>

      {/* Expanded: description + food contributions */}
      {expanded && (
        <div className="ml-2 pl-2 border-l-2 border-gray-100 space-y-1.5 pt-1">
          {description && (
            <p className="text-[11px] text-gray-500 leading-relaxed">{description}</p>
          )}
          {contributions && contributions.map((c, i) => {
            const contribPct = target > 0 ? (c.nutrient_value / target) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-500 truncate flex-1">{c.food_name} ({Math.round(c.amount_g)}g)</span>
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={clsx("h-full rounded-full", isLimitNutrient ? "bg-amber-300" : "bg-brand-300")} style={{ width: `${Math.min(contribPct, 100)}%` }} />
                </div>
                <span className="text-gray-600 w-14 text-right">{fmt(c.nutrient_value)}{unit}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n < 10 ? n.toFixed(1) : n.toFixed(0);
}
