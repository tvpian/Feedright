"use client";

import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { RefreshCw, Calendar, ChefHat, Utensils, Coffee, Cookie, Play, Filter } from "lucide-react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { WeeklyPlan, DayPlan, MealSlotPlan } from "@/lib/types";

const CONSTRAINTS_OPTIONS = [
  { label: "No cooking", value: "no-cook" },
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Vegan", value: "vegan" },
];

const SLOT_ICONS: Record<string, typeof Coffee> = {
  Breakfast: Coffee,
  Lunch: Utensils,
  Dinner: ChefHat,
  Snack: Cookie,
};

const SLOT_COLORS: Record<string, { bg: string; text: string }> = {
  Breakfast: { bg: "#fef3c7", text: "#92400e" },
  Lunch:     { bg: "#dbeafe", text: "#1e40af" },
  Dinner:    { bg: "#ede9fe", text: "#5b21b6" },
  Snack:     { bg: "#fce7f3", text: "#9d174d" },
};

export default function MealPlanPage() {
  const { profile } = useUser();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [constraints, setConstraints] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [loggingDay, setLoggingDay] = useState<string | null>(null);
  const [loggedDays, setLoggedDays] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");

  async function generate() {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.mealPlan.generate(profile.id, {
        start_date: format(new Date(), "yyyy-MM-dd"),
        constraints,
      });
      setPlan(result);
    } catch (err: any) {
      setError("Failed to generate plan. Please try again.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile && !plan) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function logDay(day: DayPlan) {
    if (!profile) return;
    setLoggingDay(day.day);
    try {
      for (const meal of day.meals) {
        for (let i = 0; i < meal.foods.length; i++) {
          await api.logs.addEntry(profile.id, day.day, {
            food_id: meal.foods[i].id,
            amount_g: meal.servings_g[i],
            unit: "g",
            meal_slot: meal.slot,
            notes: "From meal plan",
          });
        }
      }
      setLoggedDays((prev) => new Set([...prev, day.day]));
      setToast(`${day.day_label}'s meals logged!`);
      setTimeout(() => setToast(""), 3000);
    } catch {
      setToast("Failed to log meals");
      setTimeout(() => setToast(""), 3000);
    }
    setLoggingDay(null);
  }

  function toggleConstraint(c: string) {
    setConstraints((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  if (!profile) {
    return <div className="p-6 text-center text-gray-500">Create a profile first.</div>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-28 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Meal Plan</h1>
          <p className="text-sm text-gray-400">7-day plan tailored to your goals</p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl transition-colors ${showFilters ? "bg-brand-50 text-brand-600" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
          >
            <Filter size={20} />
          </button>
          <button
            onClick={generate}
            disabled={loading}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Constraints filter */}
      {showFilters && (
        <div className="card p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dietary Filters</p>
          <div className="flex flex-wrap gap-2">
            {CONSTRAINTS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleConstraint(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  constraints.includes(opt.value)
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="w-full py-2 mt-1 text-xs font-semibold btn-primary rounded-xl disabled:opacity-50"
          >
            {loading ? "Generating…" : "Regenerate Plan"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: "#edfcf2", color: "#0a7140" }}>
          {toast}
        </div>
      )}

      {/* Loading state */}
      {loading && !plan && (
        <div className="card p-10 text-center space-y-3">
          <RefreshCw size={28} className="mx-auto animate-spin text-brand-500" />
          <p className="text-sm font-semibold text-gray-500">Generating your plan…</p>
          <p className="text-xs text-gray-400">This may take a few seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-6 text-center">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <button onClick={generate} className="text-sm text-brand-600 font-semibold mt-2 underline">
            Try again
          </button>
        </div>
      )}

      {/* Plan */}
      {plan && (
        <div className="space-y-4">
          {plan.days.map((day) => {
            const isLogged = loggedDays.has(day.day);
            return (
              <div key={day.day} className="card overflow-hidden">
                {/* Day header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#F7F6F2" }}>
                  <div>
                    <h3 className="font-bold text-gray-800">{day.day_label}</h3>
                    <p className="text-[11px] text-gray-400">{format(new Date(day.day + "T12:00:00"), "MMM d, yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">{Math.round(day.total_calories)} kcal</span>
                    <button
                      onClick={() => logDay(day)}
                      disabled={loggingDay === day.day || isLogged}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isLogged
                          ? "bg-green-50 text-green-600 border border-green-200"
                          : "btn-primary disabled:opacity-50"
                      }`}
                    >
                      {isLogged ? (
                        "✓ Logged"
                      ) : loggingDay === day.day ? (
                        "Logging…"
                      ) : (
                        <><Play size={11} /> Log Day</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Meals */}
                <div className="divide-y divide-black/[0.04]">
                  {day.meals.map((meal) => {
                    const SlotIcon = SLOT_ICONS[meal.slot] || Utensils;
                    const colors = SLOT_COLORS[meal.slot] || { bg: "#f3f4f6", text: "#374151" };
                    return (
                      <div key={meal.slot} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: colors.bg }}
                          >
                            <SlotIcon size={14} style={{ color: colors.text }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: colors.text }}>
                            {meal.slot}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {Math.round(meal.estimated_calories)} kcal
                          </span>
                        </div>
                        <div className="space-y-1 ml-9">
                          {meal.foods.map((food, idx) => (
                            <div key={food.id + idx} className="flex items-center justify-between">
                              <span className="text-sm text-gray-700">{food.name}</span>
                              <span className="text-xs text-gray-400 tabular-nums">
                                {Math.round(meal.servings_g[idx])}g
                              </span>
                            </div>
                          ))}
                          {meal.foods.length === 0 && (
                            <p className="text-xs text-gray-300 italic">No foods matched filters</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
