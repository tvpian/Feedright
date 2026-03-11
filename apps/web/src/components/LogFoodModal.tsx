"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, TrendingUp, ScanBarcode, Globe } from "lucide-react";
import { api } from "@/lib/api";
import type { FoodItem, LogEntryCreate, WhatIfResponse } from "@/lib/types";
import { MEAL_SLOTS, NUTRIENT_LABELS } from "@/lib/types";
import { BarcodeScanner } from "@/components/BarcodeScanner";

interface Props {
  userId: string;
  date: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  preselectedFood?: FoodItem;
}

export function LogFoodModal({
  userId, date, open, onClose, onAdded, preselectedFood,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searchMode, setSearchMode] = useState<"local" | "external">("local");
  const [externalLoading, setExternalLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selected, setSelected] = useState<FoodItem | null>(preselectedFood ?? null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"g" | string>("g");
  const [slot, setSlot] = useState("Other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [whatIf, setWhatIf] = useState<WhatIfResponse | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Foods whose default_unit is not "g" can be logged by count (piece/cup/tbsp etc.)
  const hasAltUnit = selected && selected.default_unit !== "g";
  const altUnitLabel = selected?.default_unit ?? "piece";

  // Convert the displayed amount to grams based on the selected unit
  const amountInGrams = (() => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return 0;
    if (unit === "g") return n;
    // N units × grams-per-unit
    return n * (selected?.default_serving_g ?? 0);
  })();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(preselectedFood ?? null);
      const food = preselectedFood ?? null;
      if (food && food.default_unit !== "g") {
        setUnit(food.default_unit);
        setAmount("1");
      } else {
        setUnit("g");
        setAmount(food ? String(food.default_serving_g) : "");
      }
      setSlot("Other");
      setError("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, preselectedFood]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setExternalLoading(false); return; }
    // Show spinner immediately in external mode so the "not reachable" hint
    // never fires during the debounce window
    if (searchMode === "external") setExternalLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        if (searchMode === "local") {
          const res = await api.foods.search(query);
          if (!controller.signal.aborted) setResults(res);
        } else {
          const res = await api.foods.searchExternal(query, controller.signal);
          if (!controller.signal.aborted) { setResults(res); setExternalLoading(false); }
        }
      } catch (err) {
        // AbortError = intentional cancellation (user kept typing); stay silent
        if ((err as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setExternalLoading(false);
          setResults([]);
        }
      }
    }, searchMode === "local" ? 250 : 600);
    return () => { controller.abort(); clearTimeout(t); setExternalLoading(false); };
  }, [query, searchMode]);

  // Clear results when switching search modes so stale local results don't show
  useEffect(() => {
    setResults([]);
    setExternalLoading(false);
  }, [searchMode]);

  // Hint for when OFF is not reachable
  const offUnavailable = searchMode === "external" && !externalLoading && query.trim().length >= 2 && results.length === 0;

  // What-if preview: debounce fetch when food & amount are set
  useEffect(() => {
    setWhatIf(null);
    if (!selected || amountInGrams <= 0) return;
    setWhatIfLoading(true);
    const t = setTimeout(async () => {
      try {
        // FDC foods (not yet imported) need inline nutrients so the API
        // can compute the preview without a local DB lookup
        const isFdc = selected.id.startsWith("fdc:");
        const res = await api.analytics.whatIf(
          userId, date, selected.id, amountInGrams,
          isFdc ? (selected.nutrients_per_100g as unknown as Record<string, number>) : undefined,
          isFdc ? selected.name : undefined,
        );
        setWhatIf(res);
      } catch {
        setWhatIf(null);
      } finally {
        setWhatIfLoading(false);
      }
    }, 400);
    return () => { clearTimeout(t); setWhatIfLoading(false); };
  }, [selected?.id, amountInGrams, userId, date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { setError("Select a food first."); return; }
    const g = amountInGrams;
    if (g <= 0) { setError("Enter a valid amount."); return; }
    setSaving(true);
    try {
      // If this food came from USDA FDC (id starts with fdc:) import it first
      let foodId = selected.id;
      if (foodId.startsWith("fdc:")) {
        const imported = await api.foods.importExternal(selected);
        foodId = imported.id;
      }
      await api.logs.addEntry(userId, date, {
        food_id: foodId,
        amount_g: g,
        meal_slot: slot,
      } as LogEntryCreate);
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
    {showScanner && (
      <BarcodeScanner
        onClose={() => setShowScanner(false)}
        onScan={async (barcode) => {
          setShowScanner(false);
          try {
            const food = await api.foods.lookupBarcode(barcode);
            setSelected(food);
            setUnit(food.default_unit !== "g" ? food.default_unit : "g");
            setAmount(food.default_unit !== "g" ? "1" : String(food.default_serving_g));
          } catch {
            setError(`Barcode ${barcode} not found in Open Food Facts.`);
          }
        }}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <h2 className="text-lg font-semibold">Log Food</h2>
          <button onClick={onClose} className="tap-target flex items-center justify-center text-gray-500">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Search */}
          {!selected && (
            <div>
              {/* Search type toggle + barcode button */}
              <div className="flex gap-2 mb-2">
                <div className="flex flex-1 bg-gray-100 rounded-xl p-0.5">
                  <button type="button" onClick={() => setSearchMode("local")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      searchMode === "local" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                    }`}>
                    My Foods
                  </button>
                  <button type="button" onClick={() => setSearchMode("external")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors ${
                      searchMode === "external" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                    }`}>
                    <Globe size={11} /> USDA Food DB
                  </button>
                </div>
                <button type="button" onClick={() => setShowScanner(true)}
                  className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-600">
                  <ScanBarcode size={18} />
                </button>
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchMode === "local" ? "Search my foods…" : "Search USDA Food DB…"}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {externalLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {results.length > 0 && (
                <ul className="mt-2 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {results.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => {
                          setSelected(f);
                          if (f.default_unit !== "g") {
                            setUnit(f.default_unit);
                            setAmount("1");
                          } else {
                            setUnit("g");
                            setAmount(String(f.default_serving_g));
                          }
                          setQuery("");
                          setResults([]);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-brand-50 transition-colors"
                      >
                        <div className="font-medium text-sm">{f.name}</div>
                        <div className="text-xs text-gray-500">
                          {f.nutrients_per_100g.calories} kcal / 100g · {f.category}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Show helpful hints for external mode */}
              {offUnavailable && (
                <p className="mt-2 text-xs text-amber-600 text-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  USDA Food Database could not be reached. Check your connection.
                </p>
              )}
              {searchMode === "external" && !externalLoading && !query.trim() && (
                <p className="mt-2 text-xs text-gray-400 text-center">Search 400 000+ USDA foods. Select one to import and log it.</p>
              )}
            </div>
          )}

          {/* Selected food */}
          {selected && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{selected.name}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {selected.nutrients_per_100g.calories} kcal · {selected.nutrients_per_100g.protein}g protein per 100g
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 tap-target flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Amount + Unit */}
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>

              {/* Unit toggle — only show when the food has a non-gram unit */}
              {hasAltUnit && (
                <div className="flex gap-2 mb-2">
                  {[altUnitLabel, "g"].map((u) => (
                    <button
                      type="button"
                      key={u}
                      onClick={() => {
                        if (u === unit) return;
                        // Convert current value when switching units
                        const n = parseFloat(amount);
                        if (!isNaN(n) && n > 0 && selected) {
                          if (u === "g") {
                            // pieces → grams
                            setAmount(String(Math.round(n * selected.default_serving_g)));
                          } else {
                            // grams → pieces (keep one decimal)
                            const pieces = n / selected.default_serving_g;
                            setAmount(pieces % 1 === 0 ? String(pieces) : pieces.toFixed(1));
                          }
                        }
                        setUnit(u);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        unit === u
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              )}

              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  selected
                    ? unit === "g"
                      ? `Default: ${selected.default_serving_g}g`
                      : `e.g. 2 ${altUnitLabel}s`
                    : "e.g. 150"
                }
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                min={0}
                step="any"
              />
              {selected && amountInGrams > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {unit !== "g" && (
                    <span className="text-gray-400">{Math.round(amountInGrams)}g · </span>
                  )}
                  ≈ {Math.round((selected.nutrients_per_100g.calories * amountInGrams) / 100)} kcal ·{" "}
                  {((selected.nutrients_per_100g.protein * amountInGrams) / 100).toFixed(1)}g protein
                </p>
              )}
            </div>

            {/* What-If Preview */}
            {selected && amountInGrams > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={14} className="text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700">What-If Preview</span>
                </div>
                {whatIfLoading ? (
                  <p className="text-xs text-blue-400">Calculating…</p>
                ) : whatIf && whatIf.gaps.length > 0 ? (
                  <div className="space-y-1.5">
                    {whatIf.gaps.slice(0, 8).map((g) => {
                      const isLimit = g.is_limit;
                      return (
                      <div key={g.key} className="flex items-center gap-2 text-xs">
                        <span className={`w-20 truncate ${isLimit ? "text-amber-700 font-medium" : "text-gray-600"}`}>
                          {isLimit && "⬆ "}{NUTRIENT_LABELS[g.key] || g.key}
                        </span>
                        <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full absolute left-0 ${isLimit ? "bg-amber-200" : "bg-blue-300"}`}
                            style={{ width: `${Math.min(g.before_pct, 100)}%` }}
                          />
                          <div
                            className={`h-full rounded-full absolute left-0 ${isLimit ? "bg-red-400" : "bg-green-500"}`}
                            style={{ width: `${Math.min(g.after_pct, 100)}%`, opacity: 0.7 }}
                          />
                        </div>
                        <span className={`font-medium w-12 text-right ${isLimit ? "text-red-600" : "text-green-600"}`}>
                          {isLimit ? "+" : "+"}{g.delta_pct.toFixed(0)}%{isLimit && g.after_pct > 100 ? " ⚠" : ""}
                        </span>
                      </div>
                      );
                    })}
                    <p className="text-[10px] text-blue-400 mt-1">+{whatIf.calories_added.toFixed(0)} kcal added</p>
                  </div>
                ) : whatIf ? (
                  <p className="text-xs text-blue-400">Minimal impact on your remaining gaps.</p>
                ) : null}
              </div>
            )}

            {/* Meal slot */}
            <div>
              <label className="block text-sm font-medium mb-1">Meal</label>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOTS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSlot(s)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      slot === s
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={!selected || saving}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Add to Log"}
            </button>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
