"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { PlusCircle, Trash2, Play, RefreshCw, BookMarked } from "lucide-react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { FoodItem, SavedMeal } from "@/lib/types";

const today = format(new Date(), "yyyy-MM-dd");

export default function SavedMealsPage() {
  const { profile } = useUser();
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [logging, setLogging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try { setMeals(await api.savedMeals.list(profile.id)); } catch {}
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function logMeal(mealId: string) {
    if (!profile) return;
    setLogging(mealId);
    try {
      await api.savedMeals.log(profile.id, mealId, today);
      setMessage("Meal logged to today!");
      setTimeout(() => setMessage(""), 3000);
    } catch {}
    setLogging(null);
  }

  async function deleteMeal(mealId: string) {
    if (!profile) return;
    setDeleting(mealId);
    try {
      await api.savedMeals.delete(profile.id, mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
    } catch {}
    setDeleting(null);
    setConfirmId(null);
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Saved Meals</h1>
          <p className="text-sm text-gray-400">Quick-log your favourite bundles</p>
        </div>
        <button onClick={load} className="tap-target flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100">
          <RefreshCw size={20} />
        </button>
      </div>

      {message && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "#edfcf2", color: "#0a7140" }}>
          {message}
        </div>
      )}

      {meals.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <BookMarked size={36} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">No saved meals yet.</p>
          <p className="text-xs text-gray-300">Save a meal from the log screen or create one below.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meals.map((meal) => (
            <div
              key={meal.id}
              className="card overflow-hidden"
            >
              <div className="p-4 flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "#edfcf2" }}
                >
                  <BookMarked size={18} style={{ color: "#0a7140" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base">{meal.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {meal.components.length} items
                    {meal.total_calories != null && ` · ${Math.round(meal.total_calories)} kcal`}
                  </p>
                  {meal.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meal.tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-xl font-semibold" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-black/[0.04] px-4 py-3 flex gap-2">
                <button
                  onClick={() => logMeal(meal.id)}
                  disabled={logging === meal.id}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-50"
                >
                  <Play size={13} /> {logging === meal.id ? "Logging…" : "Log to Today"}
                </button>
                <button
                  onClick={() => setConfirmId(meal.id)}
                  disabled={deleting === meal.id}
                  className="py-2.5 px-3.5 rounded-xl disabled:opacity-50 transition-all"
                  style={{ background: "#fff1f2", color: "#be123c" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmId !== null}
        title="Delete saved meal?"
        message="This meal will be permanently removed. You can always recreate it later."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmId && deleteMeal(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

