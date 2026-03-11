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
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Food Log</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyYesterday}
            disabled={copying}
            title="Copy yesterday's log"
            className="tap-target flex items-center justify-center text-gray-400 hover:text-brand-600 disabled:opacity-40"
          >
            {copying ? <RefreshCw size={19} className="animate-spin" /> : <Copy size={19} />}
          </button>
          <button onClick={load} className="tap-target flex items-center justify-center text-gray-400">
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Calorie summary bar */}
      {log && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex justify-around text-center">
          {(["calories", "protein", "fat", "carbs"] as const).map((k) => (
            <div key={k}>
              <p className="text-lg font-bold">{Math.round(log.nutrient_totals[k])}</p>
              <p className="text-xs text-gray-500 capitalize">{k === "calories" ? "kcal" : `g ${k}`}</p>
            </div>
          ))}
        </div>
      )}

      {/* Water tracker */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets size={18} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">Water</span>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {water ? Math.round(water.total_ml) : 0}
            <span className="text-gray-400 font-normal"> / {water?.goal_ml ?? 2500} ml</span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-300"
            style={{ width: `${waterPct}%` }}
          />
        </div>
        {/* Quick-add buttons */}
        <div className="flex gap-2">
          {WATER_PRESETS.map((ml) => (
            <button
              key={ml}
              onClick={() => addWater(ml)}
              disabled={addingWater}
              className="flex-1 py-1.5 text-xs font-medium rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 transition-colors"
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
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-700"
              >
                {Math.round(e.amount_ml)}ml
                <button
                  onClick={() => deleteWaterEntry(e.id)}
                  className="ml-0.5 text-blue-300 hover:text-red-400"
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
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400">
          <p className="text-sm">Nothing logged yet. Tap + to add food.</p>
        </div>
      ) : (
        slotGroups.map(({ slot, entries }) => {
          const tot = slotTotals(entries);
          return (
            <div key={slot} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{slot}</h3>
                <div className="flex gap-3 text-xs text-gray-400">
                  <span>{Math.round(tot.cal)} kcal</span>
                  <span>P {tot.prot.toFixed(1)}g</span>
                  <span>F {tot.fat.toFixed(1)}g</span>
                  <span>C {tot.carbs.toFixed(1)}g</span>
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <li key={entry.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{entry.food_name}</p>
                      {editingId === entry.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
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
                            className="w-20 px-2 py-0.5 text-xs border border-brand-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                            min={0}
                            step="any"
                          />
                          <span className="text-xs text-gray-400">g</span>
                          <button
                            onClick={() => saveEdit(entry)}
                            disabled={saving}
                            className="p-0.5 text-green-500 hover:text-green-700"
                          >
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(entry)}
                          className="text-xs text-gray-500 hover:text-brand-600 hover:underline text-left"
                        >
                          {formatEntryAmount(entry)}
                        </button>
                      )}
                    </div>
                    {editingId !== entry.id && (
                      <>
                        <button
                          onClick={() => startEdit(entry)}
                          className="tap-target flex items-center justify-center text-gray-300 hover:text-brand-500"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry)}
                          disabled={deleting === entry.id}
                          className="tap-target flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 size={17} />
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
            className="fixed bottom-20 right-4 flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-full shadow-lg text-sm z-40"
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

