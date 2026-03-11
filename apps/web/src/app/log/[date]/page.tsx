"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Droplets, PlusCircle, Trash2, RefreshCw, Pencil, X } from "lucide-react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { DailyLog, LogEntry, WaterDaySummary } from "@/lib/types";
import { MEAL_SLOTS, formatEntryAmount } from "@/lib/types";
import { LogFoodModal } from "@/components/LogFoodModal";

// Preset water amounts in ml (glass sizes)
const WATER_PRESETS = [150, 250, 330, 500];

export default function LogPage() {
  const { date } = useParams<{ date: string }>();
  const { profile } = useUser();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  // Water tracking
  const [water, setWater] = useState<WaterDaySummary | null>(null);
  const [addingWater, setAddingWater] = useState(false);

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
    if (!profile) return;
    setAddingWater(true);
    try {
      const updated = await api.water.add(profile.id, date, ml);
      setWater(updated);
    } catch {}
    setAddingWater(false);
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
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-4">
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

      {/* Water tracker */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <Droplets size={15} className="text-blue-500" />
            </div>
            <span className="text-sm font-semibold text-gray-700">Water</span>
          </div>
          <span className="text-sm font-bold text-blue-600">
            {water ? Math.round(water.total_ml) : 0}
            <span className="text-xs text-gray-400 font-normal"> / {water?.goal_ml ?? 2500} ml</span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-blue-50 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${waterPct}%`, background: "linear-gradient(90deg,#38bdf8,#0ea5e9)" }}
          />
        </div>
        {/* Quick-add buttons */}
        <div className="flex gap-2">
          {WATER_PRESETS.map((ml) => (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={addingWater}
              className="flex-1 py-2 text-xs font-semibold rounded-xl text-blue-600 disabled:opacity-40 transition-colors"
              style={{ background: "#eff6ff" }}
            >
              +{ml}ml
            </button>
          ))}
        </div>
        {/* Recent entries */}
        {water && water.entries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {water.entries.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-blue-600"
                style={{ background: "#eff6ff" }}
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

