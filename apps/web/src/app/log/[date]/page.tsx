"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Droplets, PlusCircle, Trash2, RefreshCw, Pencil, X, BookMarked } from "lucide-react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { DailyLog, LogEntry, WaterDaySummary } from "@/lib/types";
import { MEAL_SLOTS, formatEntryAmount } from "@/lib/types";
import { LogFoodModal } from "@/components/LogFoodModal";
import { ConfirmModal } from "@/components/ConfirmModal";

// Preset water amounts in ml — labelled for quick recognition
const WATER_PRESETS = [
  { ml: 150, label: "Small",  icon: "🥤" },
  { ml: 250, label: "Glass",  icon: "🥛" },
  { ml: 330, label: "Can",    icon: "🥫" },
  { ml: 500, label: "Bottle", icon: "🧴" },
];

export default function LogPage() {
  const { date } = useParams<{ date: string }>();
  const { profile } = useUser();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealNamePrompt, setMealNamePrompt] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealSaved, setMealSaved] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  // Water tracking
  const [water, setWater] = useState<WaterDaySummary | null>(null);
  const [addingWater, setAddingWater] = useState(false);
  const [customWater, setCustomWater] = useState("");
  const [showWaterLog, setShowWaterLog] = useState(false);
  const [waterAnimation, setWaterAnimation] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [logData, waterData] = await Promise.all([
        api.logs.getDay(profile.id, date),
        api.water.getDay(profile.id, date),
      ]);
      setLog(logData);
      setWater(waterData);
    } catch {}
  }, [profile, date]);

  useEffect(() => { load(); }, [load]);

  // Focus the inline edit input when it appears
  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 50);
  }, [editingId]);

  async function deleteEntry(entry: LogEntry) {
    if (!profile) return;
    setDeleting(entry.id);
    try {
      await api.logs.deleteEntry(profile.id, date, entry.id);
      await load();
    } catch {}
    setDeleting(null);
  }

  async function copyYesterday() {
    if (!profile) return;
    setCopying(true);
    try {
      await api.logs.copyYesterday(profile.id, date);
      await load();
    } catch {}
    setCopying(false);
  }

  async function saveAsMeal() {
    if (!profile || !log || log.entries.length === 0 || !mealName.trim()) return;
    setSavingMeal(true);
    try {
      await api.savedMeals.create(profile.id, {
        name: mealName.trim(),
        tags: [],
        components: log.entries.map((e) => ({
          food_id: e.food_id,
          amount_g: e.amount_g,
          unit: e.unit ?? "g",
        })),
      });
      setMealSaved(mealName.trim());
      setMealNamePrompt(false);
      setMealName("");
      setTimeout(() => setMealSaved(""), 3000);
    } catch {}
    setSavingMeal(false);
  }

  function startEdit(entry: LogEntry) {
    setEditingId(entry.id);
    setEditAmount(String(entry.amount_g));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAmount("");
  }

  async function saveEdit(entry: LogEntry) {
    if (!profile) return;
    const g = parseFloat(editAmount);
    if (isNaN(g) || g <= 0) { cancelEdit(); return; }
    setSaving(true);
    try {
      await api.logs.updateEntry(profile.id, date, entry.id, {
        food_id: entry.food_id,
        amount_g: g,
        unit: entry.unit,
        meal_slot: entry.meal_slot,
        notes: entry.notes ?? "",
      });
      await load();
    } catch {}
    setSaving(false);
    setEditingId(null);
    setEditAmount("");
  }

  async function addWater(ml: number) {
    if (!profile || ml <= 0) return;
    setAddingWater(true);
    setWaterAnimation(true);
    try {
      const updated = await api.water.add(profile.id, date, ml);
      setWater(updated);
    } catch {}
    setAddingWater(false);
    setTimeout(() => setWaterAnimation(false), 600);
  }

  async function deleteWaterEntry(entryId: string) {
    if (!profile) return;
    try {
      await api.water.delete(profile.id, date, entryId);
      const updated = await api.water.getDay(profile.id, date);
      setWater(updated);
    } catch {}
  }

  const slotGroups = MEAL_SLOTS.map((slot) => ({
    slot,
    entries: log?.entries.filter((e) => e.meal_slot === slot) ?? [],
  })).filter((g) => g.entries.length > 0);

  // Per-slot macro totals
  function slotTotals(entries: LogEntry[]) {
    let cal = 0, prot = 0, fat = 0, carbs = 0;
    for (const e of entries) {
      const f = e.food_nutrients_per_100g;
      if (!f) continue;
      const scale = e.amount_g / 100;
      cal   += (f.calories  ?? 0) * scale;
      prot  += (f.protein   ?? 0) * scale;
      fat   += (f.fat       ?? 0) * scale;
      carbs += (f.carbs     ?? 0) * scale;
    }
    return { cal, prot, fat, carbs };
  }

  const waterPct = water ? Math.min((water.total_ml / water.goal_ml) * 100, 100) : 0;

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-28 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Food Log</h1>
          <p className="text-sm text-gray-400 font-medium">
            {format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyYesterday}
            disabled={copying}
            title="Copy yesterday's log"
            className="tap-target flex items-center justify-center text-gray-400 hover:text-brand-600 disabled:opacity-40 rounded-xl hover:bg-gray-100"
          >
            {copying ? <RefreshCw size={19} className="animate-spin" /> : <Copy size={19} />}
          </button>
          <button onClick={load} className="tap-target flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Calorie summary bar */}
      {log && (
        <div className="rounded-2xl p-4 flex justify-around text-center" style={{ background: "linear-gradient(135deg,#0a7140,#16b05e)", boxShadow: "0 4px 20px rgba(12,143,74,0.25)" }}>
          {(["calories", "protein", "fat", "carbs"] as const).map((k) => (
            <div key={k}>
              <p className="text-xl font-extrabold text-white">{Math.round(log.nutrient_totals[k])}</p>
              <p className="text-[11px] font-medium text-white/60 capitalize">{k === "calories" ? "kcal" : `g ${k}`}</p>
            </div>
          ))}
        </div>
      )}

      {/* Water tracker — redesigned */}
      <div className="card overflow-hidden">
        {/* Header + visual fill */}
        <div className="relative px-4 pt-4 pb-3">
          {/* Animated background fill */}
          <div
            className="absolute inset-0 transition-all duration-700 ease-out"
            style={{
              background: `linear-gradient(to top, rgba(56,189,248,${Math.min(waterPct / 100 * 0.15, 0.15)}) ${waterPct}%, transparent ${waterPct}%)`,
            }}
          />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 ${waterAnimation ? "scale-125" : ""}`}
                style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)" }}>
                <Droplets size={17} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-gray-800">Water</span>
                <p className="text-[11px] text-gray-400">
                  {waterPct >= 100 ? "Goal reached! 🎉" : `${Math.round(100 - waterPct)}% remaining`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold text-blue-600 tabular-nums">
                {water ? (water.total_ml >= 1000 ? `${(water.total_ml / 1000).toFixed(1)}L` : `${Math.round(water.total_ml)}ml`) : "0ml"}
              </p>
              <p className="text-[10px] text-gray-400">of {water ? (water.goal_ml >= 1000 ? `${(water.goal_ml / 1000).toFixed(1)}L` : `${water.goal_ml}ml`) : "2.5L"}</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="relative mt-3 h-2.5 bg-blue-50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${waterAnimation ? "animate-pulse" : ""}`}
              style={{
                width: `${waterPct}%`,
                background: waterPct >= 100
                  ? "linear-gradient(90deg,#34d399,#10b981)"
                  : "linear-gradient(90deg,#7dd3fc,#38bdf8,#0ea5e9)",
              }}
            />
            {/* Percentage label inside bar */}
            {waterPct > 15 && (
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-white/80">
                {Math.round(waterPct)}%
              </span>
            )}
          </div>
        </div>

        {/* Quick-add grid */}
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {WATER_PRESETS.map(({ ml, label, icon }) => (
              <button
                key={ml}
                onClick={() => addWater(ml)}
                disabled={addingWater}
                className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-blue-600 disabled:opacity-40 transition-all active:scale-95 hover:bg-blue-100"
                style={{ background: "#f0f9ff" }}
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="text-[11px] font-bold">+{ml}ml</span>
                <span className="text-[9px] text-gray-400">{label}</span>
              </button>
            ))}
          </div>

          {/* Custom amount row */}
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="numeric"
                value={customWater}
                onChange={(e) => setCustomWater(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const ml = parseInt(customWater);
                    if (ml > 0) { addWater(ml); setCustomWater(""); }
                  }
                }}
                placeholder="Custom ml"
                className="w-full pl-3 pr-10 py-2 text-xs border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">ml</span>
            </div>
            <button
              onClick={() => {
                const ml = parseInt(customWater);
                if (ml > 0) { addWater(ml); setCustomWater(""); }
              }}
              disabled={addingWater || !customWater || parseInt(customWater) <= 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40 transition-colors"
              style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)" }}
            >
              +Add
            </button>
          </div>
        </div>

        {/* Recent entries — collapsible */}
        {water && water.entries.length > 0 && (
          <div className="border-t border-black/[0.04]">
            <button
              onClick={() => setShowWaterLog(!showWaterLog)}
              className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span>{water.entries.length} entries today</span>
              <span>{showWaterLog ? "Hide ▴" : "Show ▾"}</span>
            </button>
            {showWaterLog && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {water.entries.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-blue-600"
                    style={{ background: "#f0f9ff" }}
                  >
                    {Math.round(e.amount_ml)}ml
                    <button
                      onClick={() => deleteWaterEntry(e.id)}
                      className="ml-0.5 text-blue-300 hover:text-red-400 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grouped log entries */}
      {slotGroups.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🥗</div>
          <p className="font-semibold text-gray-700">Nothing logged yet</p>
          <p className="text-sm text-gray-400 mt-1">Tap + to add your first food</p>
        </div>
      ) : (
        slotGroups.map(({ slot, entries }) => {
          const tot = slotTotals(entries);
          return (
            <div key={slot} className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#F7F6F2" }}>
                <h3 className="text-sm font-bold text-gray-700">{slot}</h3>
                <div className="flex gap-2 text-xs font-semibold">
                  <span className="text-gray-500">{Math.round(tot.cal)} kcal</span>
                  <span className="text-sky-600">P {tot.prot.toFixed(0)}g</span>
                  <span className="text-amber-600">C {tot.carbs.toFixed(0)}g</span>
                  <span className="text-emerald-600">F {tot.fat.toFixed(0)}g</span>
                </div>
              </div>
              <ul className="divide-y divide-black/[0.04]">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-gray-900">{entry.food_name}</p>
                      {editingId === entry.id ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <input
                            ref={editRef}
                            type="number"
                            inputMode="decimal"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(entry);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="w-20 px-2.5 py-1 text-xs border border-brand-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                            min={0}
                            step="any"
                          />
                          <span className="text-xs text-gray-400">g</span>
                          <button
                            onClick={() => saveEdit(entry)}
                            disabled={saving}
                            className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white disabled:opacity-40"
                          >
                            <Check size={12} />
                          </button>
                          <button onClick={cancelEdit} className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(entry)}
                          className="text-xs text-gray-400 hover:text-brand-600 transition-colors text-left mt-0.5"
                        >
                          {formatEntryAmount(entry)}
                        </button>
                      )}
                    </div>
                    {editingId !== entry.id && (
                      <>
                        <button
                          onClick={() => startEdit(entry)}
                          className="tap-target flex items-center justify-center text-gray-300 hover:text-brand-500 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry)}
                          disabled={deleting === entry.id}
                          className="tap-target flex items-center justify-center text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {/* Save as Meal button — when there are entries */}
      {slotGroups.length > 0 && (
        <>
          {mealSaved && (
            <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "#edfcf2", color: "#0a7140" }}>
              &quot;{mealSaved}&quot; saved! Find it in Profile → Meals.
            </div>
          )}
          <button
            onClick={() => { setMealName(`${format(new Date(date + "T12:00:00"), "EEEE")} meal`); setMealNamePrompt(true); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-brand-600 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 transition-colors"
          >
            <BookMarked size={15} /> Save today&apos;s log as a Meal
          </button>
        </>
      )}

      {/* Meal name prompt modal */}
      {mealNamePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl shadow-xl w-[90%] max-w-sm p-5 space-y-4">
            <h3 className="text-lg font-bold">Save as Meal</h3>
            <p className="text-sm text-gray-500">Give this meal a name so you can quickly log it again later.</p>
            <input
              type="text"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveAsMeal(); }}
              placeholder="e.g. My breakfast"
              className="input w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setMealNamePrompt(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveAsMeal}
                disabled={savingMeal || !mealName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-primary disabled:opacity-50"
              >
                {savingMeal ? "Saving…" : "Save Meal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {profile && (
        <>
          <button
            onClick={() => setModal(true)}
            className="fab"
          >
            <PlusCircle size={18} /> Add Food
          </button>
          <LogFoodModal
            userId={profile.id}
            date={date}
            open={modal}
            onClose={() => setModal(false)}
            onAdded={load}
          />
        </>
      )}
    </div>
  );
}

