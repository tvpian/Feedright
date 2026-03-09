"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { PlusCircle, Trash2, Play, RefreshCw, BookMarked } from "lucide-react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
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
    if (!profile || !confirm("Delete this saved meal?")) return;
    setDeleting(mealId);
    try {
      await api.savedMeals.delete(profile.id, mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
    } catch {}
    setDeleting(null);
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saved Meals</h1>
          <p className="text-sm text-gray-500">Quick-log your favourite bundles</p>
        </div>
        <button onClick={load} className="tap-target flex items-center justify-center text-gray-400">
          <RefreshCw size={20} />
        </button>
      </div>

      {message && (
        <div className="bg-brand-50 border border-brand-200 text-brand-700 rounded-xl px-4 py-2.5 text-sm font-medium">
          {message}
        </div>
      )}

      {meals.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-400 space-y-2">
          <BookMarked size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No saved meals yet.</p>
          <p className="text-xs">Save a meal from the log screen or create one below.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meals.map((meal) => (
            <div
              key={meal.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
            >
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base">{meal.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {meal.components.length} items
                    {meal.total_calories != null && ` · ${Math.round(meal.total_calories)} kcal`}
                  </p>
                  {meal.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {meal.tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-100 px-4 py-2.5 flex gap-2">
                <button
                  onClick={() => logMeal(meal.id)}
                  disabled={logging === meal.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                >
                  <Play size={14} /> {logging === meal.id ? "Logging…" : "Log to Today"}
                </button>
                <button
                  onClick={() => deleteMeal(meal.id)}
                  disabled={deleting === meal.id}
                  className="py-2 px-3 border border-gray-200 text-red-400 hover:text-red-600 rounded-xl disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
