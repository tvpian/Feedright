"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { PlusCircle, Trash2, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { DailyLog, LogEntry } from "@/lib/types";
import { MEAL_SLOTS, formatEntryAmount } from "@/lib/types";
import { LogFoodModal } from "@/components/LogFoodModal";

export default function LogPage() {
  const { date } = useParams<{ date: string }>();
  const { profile } = useUser();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setLog(await api.logs.getDay(profile.id, date));
    } catch {}
  }, [profile, date]);

  useEffect(() => { load(); }, [load]);

  async function deleteEntry(entry: LogEntry) {
    if (!profile) return;
    setDeleting(entry.id);
    try {
      await api.logs.deleteEntry(profile.id, date, entry.id);
      await load();
    } catch {}
    setDeleting(null);
  }

  const slotGroups = MEAL_SLOTS.map((slot) => ({
    slot,
    entries: log?.entries.filter((e) => e.meal_slot === slot) ?? [],
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Food Log</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}
          </p>
        </div>
        <button onClick={load} className="tap-target flex items-center justify-center text-gray-400">
          <RefreshCw size={20} />
        </button>
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

      {/* Grouped log entries */}
      {slotGroups.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center text-gray-400">
          <p className="text-sm">Nothing logged yet. Tap + to add food.</p>
        </div>
      ) : (
        slotGroups.map(({ slot, entries }) => (
          <div key={slot} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">{slot}</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <li key={entry.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.food_name}</p>
                    <p className="text-xs text-gray-500">{formatEntryAmount(entry)}</p>
                  </div>
                  <button
                    onClick={() => deleteEntry(entry)}
                    disabled={deleting === entry.id}
                    className="tap-target flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
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
