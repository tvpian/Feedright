"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { CommonSupplement, ProfileCreate, SupplementInput } from "@/lib/types";
import { HEALTH_GOALS, HEALTH_CONDITIONS } from "@/lib/types";

const ACTIVITY = [
  { value: "sedentary",   label: "Sedentary (desk job)" },
  { value: "light",       label: "Light (1-3 days/week)" },
  { value: "moderate",    label: "Moderate (3-5 days/week)" },
  { value: "active",      label: "Active (6-7 days hard)" },
  { value: "very_active", label: "Very Active (physical job + training)" },
];

const DIETS = [
  "vegetarian", "vegan", "pescatarian", "gluten_free", "dairy_free", "keto", "paleo",
];

const defaultForm: ProfileCreate = {
  name: "",
  age: 30,
  sex: "male",
  weight_kg: 70,
  height_cm: 170,
  activity_level: "moderate",
  goal_mode: "maintenance",
  dietary_preferences: [],
  avoid_foods: [],
  supplement_ids: [],
  health_goals: [],
  health_conditions: [],
  supplements: [],
};

type Step = "basics" | "goals" | "conditions" | "supplements" | "diet";

export default function NewProfilePage() {
  const router = useRouter();
  const { refreshProfiles, setProfile } = useUser();
  const [form, setForm] = useState<ProfileCreate>(defaultForm);
  const [step, setStep] = useState<Step>("basics");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [commonSupps, setCommonSupps] = useState<CommonSupplement[]>([]);

  useEffect(() => {
    api.analytics.commonSupplements().then(setCommonSupps).catch(() => {});
  }, []);

  function set<K extends keyof ProfileCreate>(key: K, value: ProfileCreate[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleInList(key: "health_goals" | "health_conditions" | "dietary_preferences", val: string) {
    const list = form[key] as string[];
    set(key, list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }

  function toggleSupplement(supp: CommonSupplement) {
    const existing = form.supplements.find((s) => s.name === supp.key);
    if (existing) {
      set("supplements", form.supplements.filter((s) => s.name !== supp.key));
    } else {
      set("supplements", [...form.supplements, { name: supp.key, daily_nutrients: supp.daily_nutrients }]);
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required."); setStep("basics"); return; }
    setSaving(true);
    try {
      const created = await api.profiles.create(form);
      await refreshProfiles();
      setProfile(created);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const steps: { key: Step; label: string; num: number }[] = [
    { key: "basics",      label: "About You",   num: 1 },
    { key: "goals",       label: "Goals",        num: 2 },
    { key: "conditions",  label: "Health",       num: 3 },
    { key: "supplements", label: "Supplements",  num: 4 },
    { key: "diet",        label: "Diet & Save",  num: 5 },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
      <h1 className="text-2xl font-bold mb-2">Create Your Profile</h1>
      <p className="text-gray-500 text-sm mb-6">
        Tell us about yourself, your goals, and health conditions — we&apos;ll personalize your nutrient targets automatically.
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-8">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(s.key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              i === stepIdx
                ? "bg-brand-600 text-white"
                : i < stepIdx
                ? "bg-brand-100 text-brand-700"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Step: Basics */}
      {step === "basics" && (
        <div className="space-y-4">
          <Field label="Name">
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Alex" className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input type="number" value={form.age} onChange={(e) => set("age", Number(e.target.value))} className={INPUT} min={10} max={120} />
            </Field>
            <Field label="Sex">
              <select value={form.sex} onChange={(e) => set("sex", e.target.value as any)} className={INPUT}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Weight (kg)">
              <input type="number" value={form.weight_kg} onChange={(e) => set("weight_kg", Number(e.target.value))} className={INPUT} step={0.5} />
            </Field>
            <Field label="Height (cm)">
              <input type="number" value={form.height_cm} onChange={(e) => set("height_cm", Number(e.target.value))} className={INPUT} />
            </Field>
          </div>
          <Field label="Activity Level">
            <select value={form.activity_level} onChange={(e) => set("activity_level", e.target.value as any)} className={INPUT}>
              {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <NavButtons onNext={() => setStep("goals")} />
        </div>
      )}

      {/* Step: Goals (multi-select) */}
      {step === "goals" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select <strong>all</strong> goals that apply. We&apos;ll blend your nutrient targets to support every one of them.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {HEALTH_GOALS.map((g) => {
              const active = form.health_goals.includes(g.value);
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => toggleInList("health_goals", g.value)}
                  className={`flex items-center gap-2 py-3 px-4 rounded-xl text-sm font-medium border transition-all ${
                    active
                      ? "bg-brand-50 text-brand-700 border-brand-500 ring-2 ring-brand-200"
                      : "bg-white text-gray-700 border-gray-200 hover:border-brand-300"
                  }`}
                >
                  <span className="text-lg">{g.icon}</span>
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>
          {form.health_goals.length === 0 && (
            <p className="text-xs text-amber-600">Pick at least one goal so we can personalize your targets.</p>
          )}
          <NavButtons onPrev={() => setStep("basics")} onNext={() => setStep("conditions")} />
        </div>
      )}

      {/* Step: Health Conditions */}
      {step === "conditions" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select any conditions you have. This adjusts macros &amp; micronutrient targets accordingly. <em>Skip if none apply.</em>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {HEALTH_CONDITIONS.map((c) => {
              const active = form.health_conditions.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleInList("health_conditions", c.value)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                    active
                      ? "bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-200"
                      : "bg-white text-gray-700 border-gray-200 hover:border-rose-300"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <NavButtons onPrev={() => setStep("goals")} onNext={() => setStep("supplements")} />
        </div>
      )}

      {/* Step: Supplements */}
      {step === "supplements" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Tell us what supplements you take daily. We&apos;ll subtract their nutrients from your food targets so you see <em>remaining dietary gaps</em> only.
          </p>
          {commonSupps.length === 0 ? (
            <p className="text-sm text-gray-400">Loading supplements…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {commonSupps.map((s) => {
                const active = form.supplements.some((fs) => fs.name === s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSupplement(s)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                      active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-400 ring-2 ring-emerald-200"
                        : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          {form.supplements.length > 0 && (
            <p className="text-xs text-emerald-600">{form.supplements.length} supplement(s) selected</p>
          )}
          <NavButtons onPrev={() => setStep("conditions")} onNext={() => setStep("diet")} />
        </div>
      )}

      {/* Step: Diet & Final */}
      {step === "diet" && (
        <div className="space-y-5">
          <Field label="Dietary Preferences (optional)">
            <div className="flex flex-wrap gap-2">
              {DIETS.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleInList("dietary_preferences", d)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.dietary_preferences.includes(d)
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                  }`}
                >
                  {d.replace("_", "-")}
                </button>
              ))}
            </div>
          </Field>

          {/* Summary Card */}
          <div className="bg-gray-50 rounded-2xl border p-4 space-y-2 text-sm">
            <h3 className="font-semibold text-gray-800">Profile Summary</h3>
            <Row label="Name" value={form.name || "—"} />
            <Row label="Age / Sex" value={`${form.age} / ${form.sex}`} />
            <Row label="Weight / Height" value={`${form.weight_kg} kg / ${form.height_cm} cm`} />
            <Row label="Activity" value={ACTIVITY.find((a) => a.value === form.activity_level)?.label || form.activity_level} />
            <Row label="Goals" value={form.health_goals.length ? form.health_goals.map((g) => HEALTH_GOALS.find((hg) => hg.value === g)?.label || g).join(", ") : "None selected"} />
            <Row label="Conditions" value={form.health_conditions.length ? form.health_conditions.map((c) => HEALTH_CONDITIONS.find((hc) => hc.value === c)?.label || c).join(", ") : "None"} />
            <Row label="Supplements" value={form.supplements.length ? `${form.supplements.length} selected` : "None"} />
            <Row label="Diet" value={form.dietary_preferences.length ? form.dietary_preferences.join(", ") : "No restrictions"} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("supplements")}
              className="flex-1 py-3 border border-gray-300 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-[2] py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl text-base disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create Profile & Start Tracking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButtons({ onPrev, onNext }: { onPrev?: () => void; onNext?: () => void }) {
  return (
    <div className="flex gap-3 pt-2">
      {onPrev && (
        <button type="button" onClick={onPrev} className="flex-1 py-3 border border-gray-300 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
          &larr; Back
        </button>
      )}
      {onNext && (
        <button type="button" onClick={onNext} className={`${onPrev ? "flex-[2]" : "w-full"} py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl text-sm transition-colors`}>
          Next &rarr;
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

const INPUT = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white";
