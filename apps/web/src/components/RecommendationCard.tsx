"use client";

import { Flame, Zap, ChevronDown, ChevronUp } from "lucide-react";
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 flex gap-3 items-start">
        {/* Rank badge */}
        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base leading-tight mb-0.5 truncate">{rec.food.name}</div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
            <span className="flex items-center gap-1">
              <Flame size={12} className="text-orange-400" />
              {rec.estimated_calories.toFixed(0)} kcal
            </span>
            <span className="flex items-center gap-1">
              <Zap size={12} className="text-blue-400" />
              {rec.serving_g}g serving
            </span>
          </div>

          {/* Top contributions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {top.map((c) => (
              <span
                key={c.key}
                className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium"
              >
                {NUTRIENT_LABELS[c.key] ?? c.key} {c.percent_of_gap_closed.toFixed(0)}%
              </span>
            ))}
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">{rec.explanation}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {onLog && (
          <button
            onClick={() => onLog(rec.food.id, rec.serving_g)}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Log This
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="py-2 px-3 border border-gray-200 text-gray-600 rounded-xl text-sm flex items-center gap-1 hover:bg-gray-50"
        >
          Details {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
          {rec.contributions.map((c) => (
            <div key={c.key} className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{NUTRIENT_LABELS[c.key] ?? c.key}</span>
              <span className="font-medium">
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
}

export function ComboRecommendationCard({ rec, rank }: ComboProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden">
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

      <div className="px-4 pb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 border border-gray-200 text-gray-600 rounded-xl text-sm flex items-center justify-center gap-1 hover:bg-gray-50"
        >
          Details {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
