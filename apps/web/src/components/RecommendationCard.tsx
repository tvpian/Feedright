"use client";

import { Flame, Zap, ChevronDown, ChevronUp, PlusCircle } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import type { FoodRecommendation, ComboRecommendation } from "@/lib/types";
import { NUTRIENT_LABELS } from "@/lib/types";

// ── Single food recommendation card ───────────────────────────────────────────

interface SingleProps {
  rec: FoodRecommendation;
  rank: number;
  onLog?: (food_id: string, amount_g: number) => void;
}

export function SingleRecommendationCard({ rec, rank, onLog }: SingleProps) {
  const [expanded, setExpanded] = useState(false);
  const top = rec.contributions.slice(0, 3);

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex gap-3 items-start">
        {/* Rank badge */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
          style={rank === 1 ? { background: "#fef3c7", color: "#92400e" } : rank === 2 ? { background: "#f3f4f6", color: "#374151" } : { background: "#fff7ed", color: "#c2410c" }}
        >
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-tight mb-0.5 truncate">{rec.food.name}</div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
            <span className="flex items-center gap-1">
              <Flame size={12} className="text-orange-400" />
              {rec.estimated_calories.toFixed(0)} kcal
            </span>
            <span className="flex items-center gap-1">
              <Zap size={12} className="text-sky-400" />
              {rec.serving_g}g serving
            </span>
          </div>

          {/* Top contributions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {top.map((c) => (
              <span
                key={c.key}
                className="text-[11px] px-2.5 py-0.5 rounded-xl font-bold"
                style={{ background: "#edfcf2", color: "#0a7140" }}
              >
                {NUTRIENT_LABELS[c.key] ?? c.key} {c.percent_of_gap_closed.toFixed(0)}%
              </span>
            ))}
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">{rec.explanation}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2">
        {onLog && (
          <button
            onClick={() => onLog(rec.food.id, rec.serving_g)}
            className="btn-primary flex-1 py-2.5"
          >
            Log This
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="py-2.5 px-3.5 rounded-xl text-sm font-semibold flex items-center gap-1 transition-all"
          style={{ background: "#f3f4f6", color: "#6b7280" }}
        >
          Details {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-black/[0.04] px-4 py-3 space-y-1.5" style={{ background: "#f9fafb" }}>
          {rec.contributions.map((c) => (
            <div key={c.key} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{NUTRIENT_LABELS[c.key] ?? c.key}</span>
              <span className="font-semibold text-gray-700">
                {c.covered.toFixed(1)} / {c.gap_before.toFixed(1)} gap closed ({c.percent_of_gap_closed.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Combo recommendation card ──────────────────────────────────────────────────

interface ComboProps {
  rec: ComboRecommendation;
  rank: number;
  onLogCombo?: (foods: { food_id: string; amount_g: number }[]) => void;
}

export function ComboRecommendationCard({ rec, rank, onLogCombo }: ComboProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden" style={{ borderLeft: "3px solid #7c3aed" }}>
      <div className="p-4 flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base leading-tight mb-0.5">
            {rec.foods.map((f) => f.name).join(" + ")}
          </div>
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <Flame size={12} className="text-orange-400" />
            {rec.estimated_calories.toFixed(0)} kcal combined
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{rec.explanation}</p>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        {onLogCombo && (
          <button
            onClick={() =>
              onLogCombo(
                rec.foods.map((f, i) => ({
                  food_id: f.id,
                  amount_g: rec.servings_g[i],
                }))
              )
            }
            className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-1.5"
          >
            <PlusCircle size={14} /> Log All
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="py-2.5 px-3.5 rounded-xl text-sm font-semibold flex items-center gap-1 transition-all"
          style={{ background: "#f3f4f6", color: "#6b7280" }}
        >
          Details {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
          {rec.contributions.map((c) => (
            <div key={c.key} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{NUTRIENT_LABELS[c.key] ?? c.key}</span>
              <span className="font-medium">
                {c.covered.toFixed(1)} / {c.gap_before.toFixed(1)} ({c.percent_of_gap_closed.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
