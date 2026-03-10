"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/userContext";
import { api } from "@/lib/api";
import { User, ChevronRight, Settings, Scale, BookMarked, BarChart3, Lock, Unlock, KeySquare } from "lucide-react";
import { HEALTH_GOALS, HEALTH_CONDITIONS, NUTRIENT_LABELS, NUTRIENT_UNITS } from "@/lib/types";
import type { DailyTargets } from "@/lib/types";

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very Active",
};

export default function ProfilePage() {
  const { profile, profiles, setProfile, refreshProfiles, loading, lockProfile } = useUser();
  const [targetsData, setTargetsData] = useState<DailyTargets | null>(null);

  // PIN management state
  const [pinMode, setPinMode] = useState<"set" | "change" | "remove" | null>(null);
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");

  async function handlePinSubmit() {
    setPinError("");
    if (pinMode === "remove") {
      // Verify current PIN then remove
      try {
        const res = await api.profiles.verifyPin(profile!.id, pinInput);
        if (res.ok) {
          await api.profiles.removePin(profile!.id);
          setPinSuccess("PIN removed");
          setPinMode(null);
          setPinInput("");
          await refreshProfiles();
          setTimeout(() => setPinSuccess(""), 3000);
        }
      } catch {
        setPinError("Incorrect PIN");
      }
      return;
    }
    if (pinMode === "change" && pinStep === 1) {
      // Verify current PIN first
      try {
        const res = await api.profiles.verifyPin(profile!.id, pinInput);
        if (res.ok) {
          setPinStep(2);
          setPinInput("");
        }
      } catch {
        setPinError("Incorrect current PIN");
      }
      return;
    }
    // set or change step 2: enter new PIN
    if (pinInput.length < 4) { setPinError("PIN must be at least 4 digits"); return; }
    if (!pinConfirm) { setPinError("Please confirm your PIN"); return; }
    if (pinInput !== pinConfirm) { setPinError("PINs do not match"); return; }
    await api.profiles.setPin(profile!.id, pinInput);
    setPinSuccess("PIN saved");
    setPinMode(null);
    setPinInput("");
    setPinConfirm("");
    setPinStep(1);
    await refreshProfiles();
    setTimeout(() => setPinSuccess(""), 3000);
  }

  useEffect(() => {
    if (profile?.id && profile.supplements?.length > 0) {
      api.targets.get(profile.id).then(setTargetsData).catch(() => {});
    }
  }, [profile?.id, profile?.supplements]);

  // Compute supplement offsets (what supplements cover)
  const supplementOffsets = targetsData?.raw_targets && targetsData?.targets
    ? Object.entries(targetsData.raw_targets as unknown as Record<string, number>)
        .filter(([k, raw]) => {
          const adj = (targetsData.targets as unknown as Record<string, number>)[k] ?? raw;
          return raw - adj > 0.1 && k !== "calories";
        })
        .map(([k, raw]) => ({
          key: k,
          raw,
          adjusted: (targetsData.targets as unknown as Record<string, number>)[k],
          covered: raw - ((targetsData.targets as unknown as Record<string, number>)[k] ?? raw),
        }))
    : [];

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        {profile && (
          <Link
            href={`/profile/${profile.id}/edit`}
            className="tap-target flex items-center justify-center text-gray-500"
          >
            <Settings size={22} />
          </Link>
        )}
      </div>

      {!profile ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-400 space-y-3">
          <User size={36} className="mx-auto text-gray-300" />
          <p className="text-sm">No profile found.</p>
          <Link
            href="/profile/new"
            className="inline-block px-6 py-2.5 bg-brand-600 text-white font-semibold rounded-xl text-sm"
          >
            Create Profile
          </Link>
        </div>
      ) : (
        <>
          {/* Current profile card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xl">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold">{profile.name}</h2>
                <p className="text-sm text-gray-500">
                  {profile.age} yrs · {profile.sex} · {profile.weight_kg}kg · {profile.height_cm}cm
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <InfoTile label="Activity" value={ACTIVITY_LABELS[profile.activity_level] ?? profile.activity_level} />
              <InfoTile label="BMI" value={(profile.weight_kg / ((profile.height_cm / 100) ** 2)).toFixed(1)} />
            </div>

            {/* Health Goals */}
            {profile.health_goals?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Health Goals</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.health_goals.map((g) => {
                    const goal = HEALTH_GOALS.find((hg) => hg.value === g);
                    return (
                      <span key={g} className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full font-medium border border-brand-200">
                        {goal ? `${goal.icon} ${goal.label}` : g}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Health Conditions */}
            {profile.health_conditions?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Health Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.health_conditions.map((c) => {
                    const cond = HEALTH_CONDITIONS.find((hc) => hc.value === c);
                    return (
                      <span key={c} className="text-xs px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full font-medium border border-rose-200">
                        {cond?.label || c}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Supplements */}
            {profile.supplements?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Supplements ({profile.supplements.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.supplements.map((s) => (
                    <span key={s.name} className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-medium border border-emerald-200">
                      {s.name.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {/* Supplement impact on targets */}
                {supplementOffsets.length > 0 && (
                  <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-emerald-800 mb-1.5">Supplement Impact on Daily Targets</p>
                    <div className="space-y-1">
                      {supplementOffsets.map((o) => (
                        <div key={o.key} className="flex items-center justify-between text-[11px]">
                          <span className="text-emerald-700">{NUTRIENT_LABELS[o.key] || o.key}</span>
                          <span className="text-emerald-600">
                            {o.raw.toFixed(1)} → <span className="font-semibold">{o.adjusted.toFixed(1)}</span> {NUTRIENT_UNITS[o.key]}
                            <span className="text-emerald-500 ml-1">({o.covered.toFixed(1)} covered)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-emerald-500 mt-1">Your food targets are reduced because supplements already cover these amounts.</p>
                  </div>
                )}
              </div>
            )}

            {profile.dietary_preferences.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Dietary preferences</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.dietary_preferences.map((p) => (
                    <span key={p} className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full font-medium">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/profile/${profile.id}/edit`}
              className="flex items-center justify-between w-full py-2.5 px-4 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Edit profile <ChevronRight size={16} />
            </Link>
          </div>

          {/* Security / PIN */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <KeySquare size={18} className="text-violet-500" />
              <p className="font-semibold text-sm">Profile PIN</p>
              {profile.has_pin && (
                <span className="ml-auto text-[10px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-semibold">Active</span>
              )}
            </div>

            {pinSuccess && (
              <p className="text-xs text-green-600 font-medium">{pinSuccess}</p>
            )}

            {!pinMode ? (
              <div className="flex gap-2">
                {!profile.has_pin ? (
                  <button
                    onClick={() => { setPinMode("set"); setPinStep(2); setPinError(""); }}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                  >
                    Set PIN
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setPinMode("change"); setPinStep(1); setPinInput(""); setPinConfirm(""); setPinError(""); }}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl bg-violet-100 text-violet-700 hover:bg-violet-200"
                    >
                      Change PIN
                    </button>
                    <button
                      onClick={() => { setPinMode("remove"); setPinInput(""); setPinError(""); }}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"
                    >
                      Remove PIN
                    </button>
                    <button
                      onClick={() => lockProfile(profile.id)}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      Lock Now
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {pinMode === "remove" ? "Enter current PIN to confirm removal" :
                   pinMode === "change" && pinStep === 1 ? "Enter current PIN" :
                   "Enter new PIN (4–8 digits)"}
                </p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tracking-widest"
                />
                {(pinMode === "set" || (pinMode === "change" && pinStep === 2)) && (
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Confirm ••••"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tracking-widest"
                  />
                )}
                {pinError && <p className="text-xs text-rose-500">{pinError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPinMode(null); setPinInput(""); setPinConfirm(""); setPinError(""); setPinStep(1); }}
                    className="flex-1 py-2 text-xs font-medium rounded-xl bg-gray-100 text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePinSubmit}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                  >
                    {pinMode === "remove" ? "Remove" : pinMode === "change" && pinStep === 1 ? "Next" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-3 gap-2">
            <Link href="/weight" className="bg-white border rounded-xl p-3 text-center hover:bg-gray-50 transition-colors">
              <Scale size={20} className="mx-auto text-brand-600 mb-1" />
              <span className="text-xs font-medium text-gray-700">Weight</span>
            </Link>
            <Link href="/saved-meals" className="bg-white border rounded-xl p-3 text-center hover:bg-gray-50 transition-colors">
              <BookMarked size={20} className="mx-auto text-brand-600 mb-1" />
              <span className="text-xs font-medium text-gray-700">Meals</span>
            </Link>
            <Link href="/insights" className="bg-white border rounded-xl p-3 text-center hover:bg-gray-50 transition-colors">
              <BarChart3 size={20} className="mx-auto text-brand-600 mb-1" />
              <span className="text-xs font-medium text-gray-700">Insights</span>
            </Link>
          </div>

          {/* Switch profile */}
          {profiles.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <p className="px-4 py-3 text-sm font-semibold text-gray-600 border-b border-gray-100">
                Switch profile
              </p>
              <ul className="divide-y divide-gray-100">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setProfile(p)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between ${
                        p.id === profile.id ? "bg-brand-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {p.has_pin && <Lock size={12} className="text-violet-400" />}
                        {p.name}
                      </span>
                      {p.id === profile.id && (
                        <span className="text-xs text-brand-600 font-semibold">Active</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/profile/new"
            className="flex items-center justify-center gap-2 w-full py-3 border border-brand-300 text-brand-700 font-semibold rounded-2xl text-sm hover:bg-brand-50 transition-colors"
          >
            Add another profile
          </Link>
        </>
      )}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
