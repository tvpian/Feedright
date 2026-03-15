"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { RefreshCw, Filter } from "lucide-react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { GapAnalysis, RecommendationResult } from "@/lib/types";
import { NutrientGrid } from "@/components/NutrientGrid";
import {
  SingleRecommendationCard,
  ComboRecommendationCard,
} from "@/components/RecommendationCard";
import { LogFoodModal } from "@/components/LogFoodModal";
import type { FoodItem } from "@/lib/types";

const CONSTRAINTS_OPTIONS = [
  { label: "No cooking",   value: "no-cook" },
  { label: "Vegetarian",  value: "vegetarian" },
  { label: "Vegan",       value: "vegan" },
];

export default function RecommendationsPage() {
  const { date } = useParams<{ date: string }>();
  const { profile } = useUser();
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [maxCal, setMaxCal] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"singles" | "combos">("singles");
  const [logModal, setLogModal] = useState(false);
  const [logFood, setLogFood] = useState<FoodItem | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        api.recommendations.getGaps(profile.id, date),
        api.recommendations.get(profile.id, date, {
          constraints,
          max_calories: maxCal ? Number(maxCal) : undefined,
        }),
      ]);
      setGaps(g);
      setResult(r);
    } catch {}
    setLoading(false);
  }, [profile, date, constraints, maxCal]);

  useEffect(() => { load(); }, [load]);

  function toggleConstraint(val: string) {
    setConstraints((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  }

  function handleLogFood(foodId: string, amountG: number) {
    const food = result?.singles.find((s) => s.food.id === foodId)?.food;
    if (food) {
      setLogFood(food);
      setLogModal(true);
    }
  }

  async function handleLogCombo(items: { food_id: string; amount_g: number }[]) {
    if (!profile) return;
    try {
      for (const item of items) {
        await api.logs.addEntry(profile.id, date, {
          food_id: item.food_id,
          amount_g: item.amount_g,
          unit: "g",
          meal_slot: "snack",
          notes: "From combo recommendation",
        });
      }
      load(); // refresh to update gaps
    } catch {}
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Next Food</h1>
          <p className="text-sm text-gray-400">{format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="tap-target flex items-center justify-center rounded-xl px-3 transition-all"
            style={showFilters ? { background: "#edfcf2", color: "#0a7140" } : { background: "#f3f4f6", color: "#6b7280" }}
          >
            <Filter size={17} />
          </button>
          <button onClick={load} className="tap-target flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filters dropdown */}
      {showFilters && (
        <div className="card p-4 space-y-3">
          <div>
            <p className="text-sm font-bold mb-2">Constraints</p>
            <div className="flex flex-wrap gap-2">
              {CONSTRAINTS_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => toggleConstraint(value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={constraints.includes(value)
                    ? { background: "linear-gradient(135deg,#0a7140,#3acb7d)", color: "white" }
                    : { background: "#f3f4f6", color: "#6b7280" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold mb-1.5">Max calories</p>
            <input
              type="number"
              value={maxCal}
              onChange={(e) => setMaxCal(e.target.value)}
              placeholder="e.g. 300"
              className="input w-36"
            />
          </div>
          <button
            onClick={load}
            className="btn-primary w-full py-2.5"
          >
            Apply
          </button>
        </div>
      )}

      {/* Gap summary */}
      {gaps && (
        <div className="card p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">Current gaps</p>
          <NutrientGrid gaps={gaps.gaps} compact showOnlyIncomplete />
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {(["singles", "combos"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2.5 text-xs font-bold rounded-xl transition-all"
            style={activeTab === tab ? { background: "white", color: "#0a7140", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" } : { color: "#9ca3af" }}
          >
            {tab === "singles" ? "Individual Foods" : "Combos"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <RefreshCw size={24} className="animate-spin text-brand-400" />
        </div>
      )}

      {/* Singles */}
      {!loading && activeTab === "singles" && (
        <div className="space-y-3">
          {(result?.singles ?? []).length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No recommendations found.</p>
          ) : (
            result!.singles.map((rec, i) => (
              <SingleRecommendationCard
                key={rec.food.id}
                rec={rec}
                rank={i + 1}
                onLog={(foodId, amountG) => handleLogFood(foodId, amountG)}
              />
            ))
          )}
        </div>
      )}

      {/* Combos */}
      {!loading && activeTab === "combos" && (
        <div className="space-y-3">
          {(result?.combos ?? []).length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No combos found.</p>
          ) : (
            result!.combos.map((rec, i) => (
              <ComboRecommendationCard key={i} rec={rec} rank={i + 1} onLogCombo={handleLogCombo} />
            ))
          )}
        </div>
      )}

      {profile && (
        <LogFoodModal
          userId={profile.id}
          date={date}
          open={logModal}
          onClose={() => setLogModal(false)}
          onAdded={load}
          preselectedFood={logFood ?? undefined}
        />
      )}
    </div>
  );
}
