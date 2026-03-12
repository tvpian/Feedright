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
  const [searchMode, setSearchMode] = useState<"local" | "external" | "create">("local");
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
  const [showNoResults, setShowNoResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Custom food creation form state
  const [createName, setCreateName]       = useState("");
  const [createCal, setCreateCal]         = useState("");
  const [createProtein, setCreateProtein] = useState("");
  const [createFat, setCreateFat]         = useState("");
  const [createCarbs, setCreateCarbs]     = useState("");
  const [createCategory, setCreateCategory] = useState("Other");
  const [createServing, setCreateServing] = useState("100");
  const [createUnit, setCreateUnit]       = useState("g");
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState("");

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
      setShowNoResults(false);
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
      // Reset create form
      setCreateName(""); setCreateCal(""); setCreateProtein("");
      setCreateFat(""); setCreateCarbs(""); setCreateCategory("Other");
      setCreateServing("100"); setCreateUnit("g"); setCreateError("");
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open, preselectedFood]);

  useEffect(() => {
    // Always clear stale results + error hint immediately on any change
    setResults([]);
    setShowNoResults(false);
    if (searchMode === "create") { setExternalLoading(false); return; }
    if (!query.trim()) { setExternalLoading(false); return; }
    // Show spinner right away in external mode — prevents the error hint
    // from flashing during the debounce window or between effect runs
    if (searchMode === "external") setExternalLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        if (searchMode === "local") {
          const res = await api.foods.search(query);
          if (!controller.signal.aborted) setResults(res);
        } else {
          const res = await api.foods.searchExternal(query, controller.signal);
          if (!controller.signal.aborted) {
            setResults(res);
            setExternalLoading(false);
            // Only show "not reachable" hint after a real empty response
            if (res.length === 0) setShowNoResults(true);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (!controller.signal.aborted) {
          setExternalLoading(false);
          setShowNoResults(true);
        }
      }
    }, searchMode === "local" ? 250 : 600);
    return () => { controller.abort(); clearTimeout(t); setExternalLoading(false); };
  }, [query, searchMode]);

  // Hint for when USDA search returned nothing or failed
  const offUnavailable = searchMode === "external" && showNoResults && query.trim().length >= 2;

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

  async function handleCreateFood(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) { setCreateError("Name is required."); return; }
    const cal   = parseFloat(createCal);
    const prot  = parseFloat(createProtein);
    const fat   = parseFloat(createFat);
    const carbs = parseFloat(createCarbs);
    const srv   = parseFloat(createServing);
    if ([cal, prot, fat, carbs, srv].some(isNaN)) { setCreateError("Fill in all numeric fields."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const created = await api.foods.create({
        name: createName.trim(),
        aliases: [],
        category: createCategory,
        default_serving_g: srv,
        default_unit: createUnit,
        tags: [],
        nutrients_per_100g: { calories: cal, protein: prot, fat, carbs },
        is_custom: true,
      } as any);
      // Auto-select the new food
      setSelected(created);
      setUnit(created.default_unit !== "g" ? created.default_unit : "g");
      setAmount(String(created.default_serving_g));
      setSearchMode("local"); // switch back so amount screen shows
    } catch (err: any) {
      setCreateError(err.message ?? "Failed to create food.");
    } finally {
      setCreating(false);
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: "min(92dvh, 92vh)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-black/[0.06] shrink-0">
          <h2 className="text-lg font-extrabold">Log Food</h2>
          <button onClick={onClose} className="tap-target flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
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
                  <button type="button" onClick={() => setSearchMode("create")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      searchMode === "create" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                    }`}>
                    + Create
                  </button>
                </div>
                <button type="button" onClick={() => setShowScanner(true)}
                  className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-600">
                  <ScanBarcode size={18} />
                </button>
              </div>
              {searchMode !== "create" && (
              <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchMode === "local" ? "Search my foods…" : "Search USDA Food DB…"}
                  className="input pl-9"
                />
                {externalLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {results.length > 0 && (
                <ul className="mt-2 card overflow-hidden divide-y divide-black/[0.04]">
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
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-semibold text-sm">{f.name}</div>
                        <div className="text-xs text-gray-400">
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
              </>
              )}

              {/* Create Food form */}
              {searchMode === "create" && (
                <form onSubmit={handleCreateFood} className="space-y-3 mt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Food name *</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Homemade Pancake"
                      className="input"
                    />
                  </div>
                  <p className="text-xs text-gray-400 -mb-1">Nutrients per 100g</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["Calories (kcal)", createCal,     setCreateCal],
                      ["Protein (g)",     createProtein, setCreateProtein],
                      ["Fat (g)",         createFat,     setCreateFat],
                      ["Carbs (g)",       createCarbs,   setCreateCarbs],
                    ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                      <div key={label}>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => setter(e.target.value)}
                          min={0}
                          step="any"
                          className="input"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Default serving (g)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={createServing}
                        onChange={(e) => setCreateServing(e.target.value)}
                        min={1}
                        step="any"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                      <select
                        value={createCategory}
                        onChange={(e) => setCreateCategory(e.target.value)}
                        className="input"
                      >
                        {["Grain","Protein","Dairy","Vegetable","Fruit","Fat","Beverage","Other"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {createError && <p className="text-xs font-semibold" style={{ color: "#be123c" }}>{createError}</p>}
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-primary w-full py-2.5 disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create & Select Food"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Selected food */}
          {selected && (
            <div className="rounded-2xl p-3.5 flex items-start justify-between gap-2" style={{ background: "#edfcf2" }}>
              <div>
                <div className="font-bold text-sm" style={{ color: "#0a7140" }}>{selected.name}</div>
                <div className="text-xs mt-0.5 text-gray-500">
                  {selected.nutrients_per_100g.calories} kcal · {selected.nutrients_per_100g.protein}g protein per 100g
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 tap-target flex items-center justify-center"
              >
                <X size={15} />
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
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick-fill serving presets */}
              {selected && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {/* Food's own default serving */}
                  {selected.default_serving_g !== 100 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (hasAltUnit) { setUnit(altUnitLabel); setAmount("1"); }
                        else { setUnit("g"); setAmount(String(selected.default_serving_g)); }
                      }}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition-colors"
                    >
                      1 {hasAltUnit ? altUnitLabel : "serving"} ({Math.round(selected.default_serving_g)}g)
                    </button>
                  )}
                  {[50, 100, 150, 200].map((g) => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => { setUnit("g"); setAmount(String(g)); }}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {g}g
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
                className="input"
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
              <div className="rounded-2xl p-3" style={{ background: "#eff6ff" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={13} style={{ color: "#2563eb" }} />
                  <span className="text-xs font-bold" style={{ color: "#1d4ed8" }}>What-If Preview</span>
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
              <label className="block text-sm font-bold mb-2">Meal</label>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOTS.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSlot(s)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    style={slot === s
                      ? { background: "linear-gradient(135deg,#0a7140,#3acb7d)", color: "white" }
                      : { background: "#f3f4f6", color: "#6b7280" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs font-semibold mt-1" style={{ color: "#be123c" }}>{error}</p>}

            <button
              type="submit"
              disabled={!selected || saving}
              className="btn-primary w-full py-3.5 disabled:opacity-50 mb-2"
            >
              {saving ? "Saving…" : "Add to Log"}
            </button>
            {/* Extra padding for mobile so submit is visible above keyboard/nav */}
            <div className="h-4 sm:h-0" />
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
