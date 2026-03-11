"use client";

import { useCallback, useEffect, useState } from "react";
import { format, addDays, parseISO } from "date-fns";
import { PlusCircle, RefreshCw, Copy, ChevronRight, AlertCircle, Scale, Zap, ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { DailyLog, FavoriteFood, GapAnalysis, StreakInfo, FoodItem } from "@/lib/types";
import { formatEntryAmount, HEALTH_GOALS } from "@/lib/types";
import { NutrientGrid } from "@/components/NutrientGrid";
import { LogFoodModal } from "@/components/LogFoodModal";
import { AiCoach } from "@/components/AiCoach";
import { MacroRings } from "@/components/MacroRings";

const todayStr = format(new Date(), "yyyy-MM-dd");

export default function DashboardPage() {
  const { profile, profiles, loading: userLoading, setProfile } = useUser();
  const [date, setDate]     = useState(todayStr);
  const isToday             = date === todayStr;
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
        api.logs.getDay(profile.id, date),
        api.recommendations.getGaps(profile.id, date),
        api.analytics.favorites(profile.id, 5).catch(() => [] as FavoriteFood[]),
        api.analytics.streaks(profile.id).catch(() => null),
      ]);
      setLog(l);
      setGaps(g);
      setFavorites(f);
      setStreaks(s);
    } catch {}
    setFetching(false);
  }, [profile, date]);

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
      await api.logs.copyYesterday(profile.id, date);
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
    // Has profiles but none active (locked) → show picker
    if (profiles.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-5 px-6">
          <div className="text-center mb-1">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: "linear-gradient(135deg,#0a7140,#3acb7d)" }}>
              <span className="text-2xl">🥗</span>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Who's tracking today?</h1>
            <p className="text-sm text-gray-500 mt-1">Select your profile to continue</p>
          </div>
          <div className="w-full max-w-xs space-y-2.5">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfile(p)}
                className="w-full flex items-center gap-4 px-4 py-3.5 bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow group"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ background: "linear-gradient(135deg,#0c8f4a,#3acb7d)" }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 text-left font-semibold text-gray-900">{p.name}</span>
                {p.has_pin ? (
                  <Lock size={15} className="text-violet-400 shrink-0" />
                ) : (
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-brand-500 shrink-0 transition-colors" />
                )}
              </button>
            ))}
            <Link
              href="/profile/new"
              className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-gray-300 text-gray-400 font-semibold rounded-2xl text-sm hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              + New profile
            </Link>
          </div>
        </div>
      );
    }
    // No profiles at all
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-2" style={{ background: "linear-gradient(135deg,#fef3c7,#fde68a)" }}>🥗</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome to FeedRight</h1>
        <p className="text-gray-500 text-sm max-w-xs">Your intelligent nutrition companion. Create a profile to start tracking.</p>
        <Link href="/profile/new" className="btn-primary mt-2 w-full max-w-xs justify-center">
          Create Profile
        </Link>
      </div>
    );
  }

  const calories = log?.nutrient_totals.calories ?? 0;
  const calTarget   = gaps?.gaps.find((g) => g.key === "calories")?.target ?? 2000;
  const proteinTarget = gaps?.gaps.find((g) => g.key === "protein")?.target ?? 50;
  const carbsTarget   = gaps?.gaps.find((g) => g.key === "carbs")?.target ?? 250;
  const fatTarget     = gaps?.gaps.find((g) => g.key === "fat")?.target ?? 65;

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
      {/* Header with date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setDate(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">
            {isToday ? "Today" : format(parseISO(date), "EEEE")}
          </h1>
          <p className="text-xs text-gray-500">{format(parseISO(date), "MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}
            disabled={isToday}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={load}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
          >
            <RefreshCw size={18} className={fetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Content fades/dims while fetching new date data */}
      <div className={`space-y-5 transition-opacity duration-200 ${fetching ? "opacity-50 pointer-events-none" : "opacity-100"}`}>

      {/* Macro rings */}
      <MacroRings
          calories={calories} calTarget={calTarget}
          protein={log?.nutrient_totals.protein ?? 0} proteinTarget={proteinTarget}
          carbs={log?.nutrient_totals.carbs ?? 0} carbsTarget={carbsTarget}
          fat={log?.nutrient_totals.fat ?? 0} fatTarget={fatTarget}
        />

      {/* Status overview */}
      {statusCounts && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Met",      count: statusCounts.complete, bg: "#edfcf2", fg: "#0a7140", dot: "#16b05e" },
            { label: "Close",    count: statusCounts.close,    bg: "#fefce8", fg: "#92400e", dot: "#f59e0b" },
            { label: "Low",      count: statusCounts.low,      bg: "#fff7ed", fg: "#9a3412", dot: "#f97316" },
            { label: "Critical", count: statusCounts.critical, bg: "#fef2f2", fg: "#991b1b", dot: "#ef4444" },
          ].map(({ label, count, bg, fg, dot }) => (
            <div key={label} className="rounded-2xl py-3 px-1" style={{ background: bg }}>
              <p className="text-xl font-extrabold" style={{ color: fg }}>{count}</p>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color: fg, opacity: 0.7 }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Critical alerts */}
      {criticalGaps.length > 0 && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "linear-gradient(135deg,#fef2f2,#fff5f5)", boxShadow: "0 0 0 1px rgba(239,68,68,0.15)" }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={15} className="text-red-500" />
            <p className="text-sm font-semibold text-red-700">Nutrition gaps today</p>
          </div>
          {criticalGaps.map((g) => (
            <div key={g.key} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-red-700">{NUTRIENT_LABELS[g.key] ?? g.key}</span>
                  <span className="text-red-400">{g.percent_complete.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-red-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${g.percent_complete}%` }} />
                </div>
              </div>
            </div>
          ))}
          <Link
            href={`/recommendations/${date}`}
            className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800"
          >
            Fix with food recommendations <ChevronRight size={12} />
          </Link>
        </div>
      )}

      {/* AI Coach */}
      <AiCoach userId={profile.id} date={date} />

      {/* Today's log entries */}
      {(log?.entries.length ?? 0) > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-700">Logged today</h2>
            <Link href={`/log/${date}`} className="text-xs text-brand-600 font-semibold hover:text-brand-700">
              See all →
            </Link>
          </div>
          <ul className="divide-y divide-black/[0.04]">
            {log!.entries.slice(0, 5).map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-brand-600">{e.food_name?.charAt(0) ?? "?"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.food_name}</p>
                  <p className="text-xs text-gray-400">{e.meal_slot} · {formatEntryAmount(e)}</p>
                </div>
              </li>
            ))}
            {log!.entries.length > 5 && (
              <li className="px-4 py-2.5 text-xs text-center text-gray-400">
                +{log!.entries.length - 5} more entries
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Nutrient breakdown */}
      {gaps && (
        <div className="card p-4">
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
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm text-gray-700">Quick Log</h2>
            <Link href="/insights" className="text-xs text-brand-600 font-semibold hover:text-brand-700">All favorites →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
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
                className="flex-shrink-0 rounded-2xl px-3.5 py-2.5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: "linear-gradient(135deg,#edfcf2,#d3f8e0)", boxShadow: "0 1px 4px rgba(12,143,74,0.12)" }}
              >
                <div className="text-xs font-bold text-brand-700 truncate max-w-[90px]">{f.food_name}</div>
                <div className="text-[10px] text-brand-500 font-medium mt-0.5">{f.count}× logged</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Health Goals & Streak */}
      {(profile.health_goals?.length > 0 || (streaks && streaks.current_streak > 0)) && (
        <div className="card p-4">
          {streaks && streaks.current_streak > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-xl" style={{ background: "linear-gradient(135deg,#fffbeb,#fef3c7)" }}>
              <div className="text-2xl">🔥</div>
              <div>
                <p className="text-sm font-bold text-amber-800">{streaks.current_streak}-day streak!</p>
                <p className="text-xs text-amber-600">Personal best: {streaks.longest_streak} days</p>
              </div>
            </div>
          )}
          {profile.health_goals?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-semibold text-sm text-gray-700">Your Goals</h2>
                <Link href="/weight" className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-700">
                  <Scale size={12} /> Weight log
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.health_goals.map((g) => {
                  const goal = HEALTH_GOALS.find((hg) => hg.value === g);
                  return (
                    <span key={g} className="px-2.5 py-1.5 text-xs font-semibold rounded-xl" style={{ background: "#edfcf2", color: "#0a7140" }}>
                      {goal ? `${goal.icon} ${goal.label}` : g}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>{/* end fade wrapper */}

      {/* FAB + copy yesterday */}
      <div className="fixed bottom-24 right-4 flex flex-col gap-2 items-end z-40">
        <button
          onClick={copyYesterday}
          disabled={copyingYesterday}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-gray-600 transition-all"
          style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", boxShadow: "0 2px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)" }}
        >
          <Copy size={13} /> {copyingYesterday ? "Copying…" : "Copy yesterday"}
        </button>
        <button
          onClick={() => setLogModal(true)}
          className="fab"
        >
          <PlusCircle size={18} /> Log Food
        </button>
      </div>

      <LogFoodModal
        userId={profile.id}
        date={date}
        open={logModal}
        onClose={() => { setLogModal(false); setPreselectedFood(undefined); }}
        onAdded={load}
        preselectedFood={preselectedFood}
      />
    </div>
  );
}
