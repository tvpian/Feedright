/**
 * Typed API client — thin wrapper around fetch().
 * All paths go through Next.js rewrites → FastAPI backend.
 */

import type {
  CommonSupplement,
  ComboRecommendation,
  DailyLog,
  DailyTargets,
  FavoriteFood,
  FoodItem,
  FoodRecommendation,
  GapAnalysis,
  LogEntry,
  LogEntryCreate,
  ProfileCreate,
  RecommendationResult,
  SavedMeal,
  StreakInfo,
  TrendResponse,
  UserProfile,
  WaterDaySummary,
  WeeklyAverages,
  WeightEntry,
  WeightEntryCreate,
  WhatIfResponse,
} from "./types";

const BASE = "/api";

async function _fetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  // 204 No Content (e.g. DELETE) — no body to parse
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export const api = {
  profiles: {
    list: () => _fetch<UserProfile[]>(`${BASE}/profiles`),
    get: (id: string) => _fetch<UserProfile>(`${BASE}/profiles/${id}`),
    create: (data: ProfileCreate) =>
      _fetch<UserProfile>(`${BASE}/profiles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<ProfileCreate>) =>
      _fetch<UserProfile>(`${BASE}/profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      _fetch<void>(`${BASE}/profiles/${id}`, { method: "DELETE" }),
    setPin: (id: string, pin: string) =>
      _fetch<void>(`${BASE}/profiles/${id}/set-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    verifyPin: (id: string, pin: string) =>
      _fetch<{ ok: boolean }>(`${BASE}/profiles/${id}/verify-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    removePin: (id: string) =>
      _fetch<void>(`${BASE}/profiles/${id}/set-pin`, {
        method: "POST",
        body: JSON.stringify({ pin: "" }),
      }),
  },

  // ── Foods ───────────────────────────────────────────────────────────────────
  foods: {
    search: (q: string, category?: string, limit = 30) => {
      const params = new URLSearchParams({ q, limit: String(limit) });
      if (category) params.set("category", category);
      return _fetch<FoodItem[]>(`${BASE}/foods?${params}`);
    },
    get: (id: string) => _fetch<FoodItem>(`${BASE}/foods/${id}`),
    create: (data: Omit<FoodItem, "id" | "is_custom">) =>
      _fetch<FoodItem>(`${BASE}/foods`, { method: "POST", body: JSON.stringify(data) }),
    searchExternal: (q: string, signal?: AbortSignal) =>
      _fetch<FoodItem[]>(`${BASE}/foods/external/search?q=${encodeURIComponent(q)}`, { signal }),
    lookupBarcode: (barcode: string) =>
      _fetch<FoodItem>(`${BASE}/foods/external/barcode/${barcode}`),
    importExternal: (food: FoodItem) =>
      _fetch<FoodItem>(`${BASE}/foods/external/import`, { method: "POST", body: JSON.stringify(food) }),
  },

  // ── Logs ────────────────────────────────────────────────────────────────────
  logs: {
    getDay: (userId: string, date: string) =>
      _fetch<DailyLog>(`${BASE}/logs/${userId}/${date}`),
    addEntry: (userId: string, date: string, data: LogEntryCreate) =>
      _fetch<LogEntry>(`${BASE}/logs/${userId}/${date}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateEntry: (userId: string, date: string, entryId: string, data: LogEntryCreate) =>
      _fetch<LogEntry>(`${BASE}/logs/${userId}/${date}/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteEntry: (userId: string, date: string, entryId: string) =>
      fetch(`${BASE}/logs/${userId}/${date}/${entryId}`, { method: "DELETE" }),
    copyYesterday: (userId: string, date: string) =>
      _fetch<DailyLog>(`${BASE}/logs/${userId}/${date}/copy-yesterday`, {
        method: "POST",
      }),
  },

  // ── Targets ─────────────────────────────────────────────────────────────────
  targets: {
    get: (userId: string) => _fetch<DailyTargets>(`${BASE}/targets/${userId}`),
  },

  // ── Saved meals ─────────────────────────────────────────────────────────────
  savedMeals: {
    list: (userId: string) => _fetch<SavedMeal[]>(`${BASE}/saved-meals/${userId}`),
    create: (
      userId: string,
      data: { name: string; tags: string[]; components: { food_id: string; amount_g: number; unit: string }[] }
    ) =>
      _fetch<SavedMeal>(`${BASE}/saved-meals/${userId}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (userId: string, mealId: string) =>
      fetch(`${BASE}/saved-meals/${userId}/${mealId}`, { method: "DELETE" }),
    log: (userId: string, mealId: string, date: string) =>
      _fetch<LogEntry[]>(`${BASE}/saved-meals/${userId}/${mealId}/log/${date}`, {
        method: "POST",
      }),
  },

  // ── Recommendations ─────────────────────────────────────────────────────────
  recommendations: {
    getGaps: (userId: string, date: string) =>
      _fetch<GapAnalysis>(`${BASE}/recommendations/${userId}/${date}/gaps`),
    get: (
      userId: string,
      date: string,
      opts?: { max_calories?: number; constraints?: string[]; preferred_tags?: string[] }
    ) =>
      _fetch<RecommendationResult>(`${BASE}/recommendations/${userId}/${date}`, {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      }),
  },

  // ── Weight Tracker ──────────────────────────────────────────────────────────
  weight: {
    log: (userId: string, data: WeightEntryCreate) =>
      _fetch<WeightEntry>(`${BASE}/weight/${userId}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    history: (userId: string, days = 30) =>
      _fetch<WeightEntry[]>(`${BASE}/weight/${userId}?days=${days}`),
    delete: (entryId: string) =>
      fetch(`${BASE}/weight/${entryId}`, { method: "DELETE" }),
  },

  // ── Analytics ───────────────────────────────────────────────────────────────
  analytics: {
    trends: (userId: string, days = 7) =>
      _fetch<TrendResponse>(`${BASE}/analytics/${userId}/trends?days=${days}`),
    streaks: (userId: string) =>
      _fetch<StreakInfo>(`${BASE}/analytics/${userId}/streaks`),
    averages: (userId: string, days = 7) =>
      _fetch<WeeklyAverages>(`${BASE}/analytics/${userId}/averages?days=${days}`),
    favorites: (userId: string, limit = 10) =>
      _fetch<FavoriteFood[]>(`${BASE}/analytics/${userId}/favorites?limit=${limit}`),
    whatIf: (
      userId: string, date: string,
      foodId: string, amountG: number,
      inlineNutrients?: Record<string, number>, foodName?: string,
    ) =>
      _fetch<WhatIfResponse>(`${BASE}/analytics/${userId}/${date}/what-if`, {
        method: "POST",
        body: JSON.stringify({
          food_id: foodId,
          amount_g: amountG,
          ...(inlineNutrients ? { nutrients_per_100g: inlineNutrients, food_name: foodName } : {}),
        }),
      }),
    commonSupplements: () =>
      _fetch<CommonSupplement[]>(`${BASE}/analytics/supplements/common`),
  },

  // ── Water Tracker ────────────────────────────────────────────────────────────
  water: {
    getDay: (userId: string, date: string) =>
      _fetch<WaterDaySummary>(`${BASE}/water/${userId}/${date}`),
    add: (userId: string, date: string, amount_ml: number) =>
      _fetch<WaterDaySummary>(`${BASE}/water/${userId}/${date}`, {
        method: "POST",
        body: JSON.stringify({ amount_ml }),
      }),
    delete: (userId: string, date: string, entryId: string) =>
      fetch(`${BASE}/water/${userId}/${date}/${entryId}`, { method: "DELETE" }),
  },
};
