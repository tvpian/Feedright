"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { TrendResponse } from "@/lib/types";

interface Props {
  trends: TrendResponse;
  targets: Record<string, number>; // nutrient key → daily target
}

const CHART_NUTRIENTS: { key: string; label: string; color: string }[] = [
  { key: "calories",   label: "Calories",  color: "#7c3aed" },
  { key: "protein",    label: "Protein",   color: "#0ea5e9" },
  { key: "carbs",      label: "Carbs",     color: "#f59e0b" },
  { key: "fat",        label: "Fat",       color: "#10b981" },
  { key: "fiber",      label: "Fiber",     color: "#84cc16" },
  { key: "vitamin_d",  label: "Vitamin D", color: "#f97316" },
  { key: "iron",       label: "Iron",      color: "#e11d48" },
  { key: "calcium",    label: "Calcium",   color: "#06b6d4" },
];

export function NutrientTrendChart({ trends, targets }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["calories", "protein", "carbs", "fat"])
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  // Build chart data: each row is a day, each nutrient is % of target (0–130+)
  const data = trends.snapshots.map((snap) => {
    const row: Record<string, any> = {
      date: format(parseISO(snap.log_date), "MMM d"),
    };
    for (const { key } of CHART_NUTRIENTS) {
      const target = targets[key];
      if (target && target > 0) {
        row[key] = Math.round((snap.nutrient_totals[key] ?? 0) / target * 100);
      } else {
        row[key] = 0;
      }
    }
    return row;
  });

  return (
    <div className="space-y-3">
      {/* Nutrient toggles */}
      <div className="flex flex-wrap gap-1.5">
        {CHART_NUTRIENTS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
              selected.has(key)
                ? "text-white border-transparent"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            }`}
            style={selected.has(key) ? { backgroundColor: color, borderColor: color } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} unit="%" domain={[0, 130]} />
            <Tooltip
              formatter={(v: any, name: any) => {
                const n = CHART_NUTRIENTS.find((x) => x.key === name);
                return [`${v}%`, n?.label ?? name];
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            {/* 100% target line */}
            <ReferenceLine y={100} stroke="#d1d5db" strokeDasharray="4 4" label={{ value: "target", position: "right", fontSize: 9, fill: "#9ca3af" }} />
            {CHART_NUTRIENTS.filter(({ key }) => selected.has(key)).map(({ key, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: color }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400 text-center">% of daily target met per day</p>
    </div>
  );
}
