"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { PlusCircle, RefreshCw, Copy, ChevronRight, AlertCircle, Scale, Zap } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { DailyLog, FavoriteFood, GapAnalysis, StreakInfo, FoodItem } from "@/lib/types";
import { formatEntryAmount, HEALTH_GOALS } from "@/lib/types";
import { NutrientGrid } from "@/components/NutrientGrid";
import { LogFoodModal } from "@/components/LogFoodModal";
import { AiCoach } from "@/components/AiCoach";

const today = format(new Date(), "yyyy-MM-dd");

export default function DashboardPage() {
  const { profile, loading: userLoading } = useUser();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [gaps, setGaps] = useState<GapAnalysis | null>(null);
  const [logModal, setLogModal] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  const [showAllNutrients, setShowAllNutrients] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [streaks, setStreaks] = useState<StreakInfo | null>(null);
  const [preselectedFood, setPreselectedFood] = useState<FoodItem | undefined>(undefined);
  const [foodMap, setFoodMap] = useState<Record<string, FoodItem>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    setFetching(true);
    try {
      const [l, g, f, s] = await Promise.all([
        api.logs.getDay(profile.id, today),
        api.recommendations.getGaps(profile.id, today),
        api.analytics.favorites(profile.id, 5).catch(() => [] as FavoriteFood[]),
        api.analytics.streaks(profile.id).catch(() => null),
      ]);
      setLog(l);
      setGaps(g);
      setFavorites(f);
      setStreaks(s);
    } catch {}
    setFetching(false);
  }, [profile]);

  // Load food details separately (non-blocking) so the main UI renders immediately
  useEffect(() => {
    if (!log) return;
    const ids = [...new Set(log.entries.map((e) => e.food_id))];
    if (!ids.length) { setFoodMap({}); return; }
    Promise.all(ids.map((id) => api.foods.get(id).catch(() => null))).then((foods) => {
      const map: Record<string, FoodItem> = {};
      for (const fd of foods) { if (fd) map[fd.id] = fd; }
      setFoodMap(map);
    });
  }, [log]);

  useEffect(() => { load(); }, [load]);

  async function copyYesterday() {
    if (!profile) return;
    setCopyingYesterday(true);
    try {
      await api.logs.copyYesterday(profile.id, today);
      await load();
    } catch {}
    setCopyingYesterday(false);
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={24} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <AlertCircle size={40} className="text-orange-400" />
        <h1 className="text-xl font-bold">No profile found</h1>
        <p className="text-gray-500 text-sm">Create your profile to get started with nutrient tracking.</p>
        <Link href="/profile/new" className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl">
          Create Profile
        </Link>
      </div>
    );
  }

  const calories = log?.nutrient_totals.calories ?? 0;
  const calTarget = gaps?.gaps.find((g) => g.key === "calories")?.target ?? 2000;
  const calPct = Math.min((calories / calTarget) * 100, 100);

  const statusCounts = gaps
    ? {
        complete: gaps.gaps.filter((g) => g.status === "complete").length,
        close:    gaps.gaps.filter((g) => g.status === "close").length,
        low:      gaps.gaps.filter((g) => g.status === "low").length,
        critical: gaps.gaps.filter((g) => g.status === "critical").length,
      }
    : null;

  const criticalGaps = gaps?.gaps.filter((g) => g.status === "critical").slice(0, 3) ?? [];
  const NUTRIENT_LABELS: Record<string, string> = {
    calories: "Calories", protein: "Protein", fat: "Fat", carbs: "Carbs",
    fiber: "Fiber", sugar: "Sugar", omega3: "Omega-3", caffeine: "Caffeine",
    magnesium: "Magnesium", potassium: "Potassium", zinc: "Zinc", iron: "Iron",
    calcium: "Calcium", selenium: "Selenium", iodine: "Iodine", choline: "Choline",
    vitamin_d: "Vitamin D", vitamin_b12: "Vitamin B12", biotin: "Biotin",
    folate: "Folate", vitamin_c: "Vitamin C",
    vitamin_a: "Vitamin A", vitamin_e: "Vitamin E", vitamin_k: "Vitamin K",
    vitamin_b1: "Thiamine (B1)", vitamin_b2: "Riboflavin (B2)",
    vitamin_b3: "Niacin (B3)", vitamin_b5: "Pant. Acid (B5)", vitamin_b6: "Vitamin B6",
    copper: "Copper", manganese: "Manganese", chromium: "Chromium", phosphorus: "Phosphorus",
    sodium: "Sodium", saturated_fat: "Saturated Fat",
  };

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today</h1>
          <p className="text-sm text-gray-500">{format(new Date(), "EEEE, MMMM d")}</p>
        </div>
        <button
          onClick={load}
          className="tap-target flex items-center justify-center text-gray-400 hover:text-brand-600"
        >
          <RefreshCw size={20} className={fetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Calorie ring / headline */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-4xl font-bold text-gray-900">{Math.round(calories)}</p>
            <p className="text-sm text-gray-500">of {Math.round(calTarget)} kcal</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-600">{Math.round(calTarget - calories)}</p>
            <p className="text-sm text-gray-500">remaining</p>
          </div>
        </div>
        {/* Calorie progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${calPct}%` }}
          />
        </div>

        {/* Macro summary */}
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {(["protein", "fat", "carbs"] as const).map((key) => {
            const val = log?.nutrient_totals?.[key] ?? 0;
            return (
              <div key={key} className="bg-gray-50 rounded-xl py-2">
                <p className="text-base font-bold text-gray-900">{Math.round(val)}g</p>
                <p className="text-xs text-gray-500 capitalize">{key}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status overview */}
      {statusCounts && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Met",      count: statusCounts.complete, color: "text-brand-600 bg-brand-50" },
            { label: "Close",    count: statusCounts.close,    color: "text-yellow-600 bg-yellow-50" },
            { label: "Low",      count: statusCounts.low,      color: "text-orange-600 bg-orange-50" },
            { label: "Critical", count: statusCounts.critical, color: "text-red-600 bg-red-50" },
          ].map(({ label, count, color }) => (
            <div key={label} className={`rounded-xl py-2 px-1 ${color}`}>
              <p className="text-xl font-bold">{count}</p>
              <p className="text-[11px] font-medium">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Critical alerts */}
      {criticalGaps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700 mb-2">Still critical today</p>
          {criticalGaps.map((g) => (
            <p key={g.key} className="text-xs text-red-600">
              • {NUTRIENT_LABELS[g.key] ?? g.key} — {g.consumed.toFixed(1)} / {g.target.toFixed(1)}{" "}
              ({g.percent_complete.toFixed(0)}%)
            </p>
          ))}
          <Link
            href={`/recommendations/${today}`}
            className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
          >
            Get recommendations <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* AI Coach */}
      <AiCoach userId={profile.id} date={today} />

      {/* Today's log entries */}
      {(log?.entries.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-700">Logged today</h2>
            <Link href={`/log/${today}`} className="text-xs text-brand-600 hover:underline">
              Edit all
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {log!.entries.slice(0, 5).map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{e.food_name}</p>
                  <p className="text-xs text-gray-500">{e.meal_slot} · {formatEntryAmount(e)}</p>
                </div>
              </li>
            ))}
            {log!.entries.length > 5 && (
              <li className="px-4 py-2 text-xs text-center text-gray-400">
                +{log!.entries.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Nutrient breakdown */}
      {gaps && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-700">Nutrients</h2>
            <button
              onClick={() => setShowAllNutrients(!showAllNutrients)}
              className="text-xs text-brand-600 hover:underline"
            >
              {showAllNutrients ? "Show incomplete only" : "Show all"}
            </button>
          </div>
          <NutrientGrid
            gaps={gaps.gaps}
            compact
            showOnlyIncomplete={!showAllNutrients}
            entries={log?.entries}
            foodMap={foodMap}
          />
        </div>
      )}

      {/* Quick-Log Favorites */}
      {favorites.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-700">Quick Log</h2>
            <Link href="/insights" className="text-xs text-brand-600 hover:underline">All favorites</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {favorites.map((f) => (
              <button
                key={f.food_id}
                onClick={async () => {
                  try {
                    const food = await api.foods.get(f.food_id);
                    setPreselectedFood(food);
                    setLogModal(true);
                  } catch {}
                }}
                className="flex-shrink-0 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 text-left hover:bg-brand-100 transition-colors"
              >
                <div className="text-xs font-semibold text-brand-700 truncate max-w-[100px]">{f.food_name}</div>
                <div className="text-[10px] text-brand-500">{f.count}x logged</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Health Goals & Streak */}
      {(profile.health_goals?.length > 0 || (streaks && streaks.current_streak > 0)) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          {streaks && streaks.current_streak > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-500" />
              <span className="text-sm font-semibold text-gray-700">{streaks.current_streak}-day streak!</span>
              <span className="text-xs text-gray-400">Best: {streaks.longest_streak}d</span>
            </div>
          )}
          {profile.health_goals?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm text-gray-700">Your Goals</h2>
                <Link href="/weight" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                  <Scale size={12} /> Weight
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.health_goals.map((g) => {
                  const goal = HEALTH_GOALS.find((hg) => hg.value === g);
                  return (
                    <span key={g} className="px-2.5 py-1 bg-brand-50 text-brand-700 text-xs font-medium rounded-full border border-brand-200">
                      {goal ? `${goal.icon} ${goal.label}` : g}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAB + copy yesterday */}
      <div className="fixed bottom-20 right-4 flex flex-col gap-2 items-end z-40">
        <button
          onClick={copyYesterday}
          disabled={copyingYesterday}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-full shadow text-xs font-medium hover:bg-gray-50"
        >
          <Copy size={13} /> {copyingYesterday ? "Copying…" : "Copy yesterday"}
        </button>
        <button
          onClick={() => setLogModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-full shadow-lg text-sm transition-colors"
        >
          <PlusCircle size={18} /> Log Food
        </button>
      </div>

      <LogFoodModal
        userId={profile.id}
        date={today}
        open={logModal}
        onClose={() => { setLogModal(false); setPreselectedFood(undefined); }}
        onAdded={load}
        preselectedFood={preselectedFood}
      />
    </div>
  );
}
