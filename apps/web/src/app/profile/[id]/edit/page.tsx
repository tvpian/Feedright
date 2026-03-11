"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import { HEALTH_GOALS, HEALTH_CONDITIONS } from "@/lib/types";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { CommonSupplement } from "@/lib/types";

const ACTIVITY = ["sedentary","light","moderate","active","very_active"];
const DIETS = ["vegetarian","vegan","pescatarian","gluten_free","dairy_free","keto","paleo"];
const INPUT = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white";

export default function EditProfilePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { refreshProfiles, setProfile } = useUser();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [commonSupps, setCommonSupps] = useState<CommonSupplement[]>([]);

  useEffect(() => {
    api.profiles.get(id).then(setForm).catch(() => {});
    api.analytics.commonSupplements().then(setCommonSupps).catch(() => {});
  }, [id]);

  function set(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function toggleInList(key: string, val: string) {
    const list: string[] = form[key] ?? [];
    set(key, list.includes(val) ? list.filter((v: string) => v !== val) : [...list, val]);
  }

  function toggleSupplement(supp: CommonSupplement) {
    const supps: any[] = form.supplements ?? [];
    const existing = supps.find((s: any) => s.name === supp.key);
    if (existing) {
      set("supplements", supps.filter((s: any) => s.name !== supp.key));
    } else {
      set("supplements", [...supps, { name: supp.key, daily_nutrients: supp.daily_nutrients }]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.profiles.update(id, form);
      await refreshProfiles();
      setProfile(updated);
      router.push("/profile");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="p-6 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Name</label>
          <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Age</label>
            <input type="number" value={form.age} onChange={(e) => set("age", Number(e.target.value))} className={INPUT} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Sex</label>
            <select value={form.sex} onChange={(e) => set("sex", e.target.value)} className={INPUT}>
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Weight (kg)</label>
            <input type="number" value={form.weight_kg} onChange={(e) => set("weight_kg", Number(e.target.value))} className={INPUT} step={0.5} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Height (cm)</label>
            <input type="number" value={form.height_cm} onChange={(e) => set("height_cm", Number(e.target.value))} className={INPUT} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Activity Level</label>
          <select value={form.activity_level} onChange={(e) => set("activity_level", e.target.value)} className={INPUT}>
            {ACTIVITY.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
          </select>
        </div>

        {/* Health Goals */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Health Goals</label>
          <div className="grid grid-cols-2 gap-2">
            {HEALTH_GOALS.map((g) => {
              const active = (form.health_goals ?? []).includes(g.value);
              return (
                <button type="button" key={g.value} onClick={() => toggleInList("health_goals", g.value)}
                  className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                    active ? "bg-brand-50 text-brand-700 border-brand-500 ring-2 ring-brand-200" : "bg-white text-gray-700 border-gray-200 hover:border-brand-300"
                  }`}>
                  <span>{g.icon}</span><span>{g.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Health Conditions */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Health Conditions</label>
          <div className="grid grid-cols-2 gap-2">
            {HEALTH_CONDITIONS.map((c) => {
              const active = (form.health_conditions ?? []).includes(c.value);
              return (
                <button type="button" key={c.value} onClick={() => toggleInList("health_conditions", c.value)}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                    active ? "bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-200" : "bg-white text-gray-700 border-gray-200 hover:border-rose-300"
                  }`}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Supplements */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Supplements</label>
          {commonSupps.length > 0 && (
            <div className="grid grid-cols-2 gap-2 max-h-[30vh] overflow-y-auto">
              {commonSupps.map((s) => {
                const active = (form.supplements ?? []).some((fs: any) => fs.name === s.key);
                return (
                  <button type="button" key={s.key} onClick={() => toggleSupplement(s)}
                    className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                      active ? "bg-emerald-50 text-emerald-700 border-emerald-400 ring-2 ring-emerald-200" : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                    }`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dietary Preferences */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Dietary Preferences</label>
          <div className="flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button type="button" key={d} onClick={() => toggleInList("dietary_preferences", d)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${(form.dietary_preferences ?? []).includes(d) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300"}`}>
                {d.replace("_", "-")}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl disabled:opacity-50">
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {/* Danger zone */}
        <div className="pt-2 border-t border-gray-100">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-2xl disabled:opacity-50 transition-colors">
            {deleting ? "Deleting\u2026" : "Delete this profile"}
          </button>
        </div>
      </form>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete profile?"
        message="All log entries, meal plans and data for this profile will be permanently removed. This cannot be undone."
        confirmLabel="Delete forever"
        danger
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          setDeleting(true);
          try {
            await api.profiles.delete(id);
            await refreshProfiles();
            router.push("/");
          } catch {
            setError("Failed to delete profile.");
            setDeleting(false);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
