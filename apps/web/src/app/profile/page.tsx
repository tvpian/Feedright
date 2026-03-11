"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/userContext";
import { api } from "@/lib/api";
import { User, ChevronRight, Settings, Scale, BookMarked, BarChart3, Lock, Unlock, KeySquare, LogOut } from "lucide-react";
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
  const { profile, profiles, setProfile, refreshProfiles, loading, lockProfile, switchProfile } = useUser();
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
        <h1 className="text-2xl font-extrabold tracking-tight">Profile</h1>
        {profile && (
          <Link
            href={`/profile/${profile.id}/edit`}
            className="tap-target flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
          >
            <Settings size={22} />
          </Link>
        )}
      </div>

      {!profile ? (
        <div className="card p-10 text-center space-y-3">
          <User size={36} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-400">No profile found.</p>
          <Link
            href="/profile/new"
            className="inline-block btn-primary text-sm"
          >
            Create Profile
          </Link>
        </div>
      ) : (
        <>
          {/* Current profile card */}
          <div
            className="rounded-2xl p-5 text-white relative overflow-hidden space-y-4"
            style={{ background: "linear-gradient(135deg,#0a7140,#16b05e,#3acb7d)" }}
          >
            <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, white, transparent)" }}
            />
            <div className="flex items-center gap-4 relative">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white font-extrabold text-2xl shrink-0" style={{ backdropFilter: "blur(8px)" }}>
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-white">{profile.name}</h2>
                <p className="text-sm text-white/70 font-medium">
                  {profile.age} yrs · {profile.sex} · {profile.weight_kg}kg · {profile.height_cm}cm
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 relative">
              {[
                { label: "Activity", value: ACTIVITY_LABELS[profile.activity_level] ?? profile.activity_level },
                { label: "BMI", value: (profile.weight_kg / ((profile.height_cm / 100) ** 2)).toFixed(1) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Health Goals */}
            {profile.health_goals?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide mb-2">Health Goals</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.health_goals.map((g) => {
                    const goal = HEALTH_GOALS.find((hg) => hg.value === g);
                    return (
                      <span key={g} className="text-xs px-2.5 py-1 rounded-xl font-semibold text-white" style={{ background: "rgba(255,255,255,0.2)" }}>
                        {goal ? `${goal.icon} ${goal.label}` : g}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

            {/* Health Conditions */}
            {profile.health_conditions?.length > 0 && (
              <div className="card p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Health Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.health_conditions.map((c) => {
                    const cond = HEALTH_CONDITIONS.find((hc) => hc.value === c);
                    return (
                      <span key={c} className="text-xs px-2.5 py-1 rounded-xl font-semibold" style={{ background: "#fff1f2", color: "#be123c" }}>
                        {cond?.label || c}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Supplements */}
            {profile.supplements?.length > 0 && (
              <div className="card p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplements ({profile.supplements.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.supplements.map((s) => (
                    <span key={s.name} className="text-xs px-2.5 py-1 rounded-xl font-semibold" style={{ background: "#ecfdf5", color: "#065f46" }}>
                      {s.name.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                {/* Supplement impact on targets */}
                {supplementOffsets.length > 0 && (
                  <div className="rounded-xl p-3" style={{ background: "#ecfdf5" }}>
                    <p className="text-[10px] font-bold mb-1.5" style={{ color: "#065f46" }}>Supplement Impact on Daily Targets</p>
                    <div className="space-y-1">
                      {supplementOffsets.map((o) => (
                        <div key={o.key} className="flex items-center justify-between text-[11px]">
                          <span style={{ color: "#047857" }}>{NUTRIENT_LABELS[o.key] || o.key}</span>
                          <span style={{ color: "#059669" }}>
                            {o.raw.toFixed(1)} → <span className="font-semibold">{o.adjusted.toFixed(1)}</span> {NUTRIENT_UNITS[o.key]}
                            <span className="ml-1 opacity-70">({o.covered.toFixed(1)} covered)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] mt-1" style={{ color: "#6ee7b7" }}>Your food targets are reduced because supplements already cover these amounts.</p>
                  </div>
                )}
              </div>
            )}

            {profile.dietary_preferences.length > 0 && (
              <div className="card p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dietary Preferences</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.dietary_preferences.map((p) => (
                    <span key={p} className="text-xs px-2.5 py-1 rounded-xl font-semibold" style={{ background: "#edfcf2", color: "#0a7140" }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/profile/${profile.id}/edit`}
              className="flex items-center justify-between w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors" style={{ background: "#edfcf2", color: "#0a7140" }}
            >
              Edit profile <ChevronRight size={16} />
            </Link>

          {/* Security / PIN */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f3f0ff" }}>
                <KeySquare size={16} className="text-violet-600" />
              </div>
              <p className="font-bold text-sm">Profile PIN</p>
              {profile.has_pin && (
                <span className="ml-auto text-[10px] px-2.5 py-0.5 rounded-xl font-bold" style={{ background: "#ede9fe", color: "#7c3aed" }}>Active</span>
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
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl text-white transition-all" style={{ background: "#7c3aed" }}
                  >
                    Set PIN
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setPinMode("change"); setPinStep(1); setPinInput(""); setPinConfirm(""); setPinError(""); }}
                      className="flex-1 py-2.5 text-xs font-bold rounded-xl transition-all" style={{ background: "#ede9fe", color: "#7c3aed" }}
                    >
                      Change
                    </button>
                    <button
                      onClick={() => { setPinMode("remove"); setPinInput(""); setPinError(""); }}
                      className="flex-1 py-2.5 text-xs font-bold rounded-xl transition-all" style={{ background: "#fff1f2", color: "#be123c" }}
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => lockProfile(profile.id)}
                      className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
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
                  className="input text-center tracking-widest"
                />
                {(pinMode === "set" || (pinMode === "change" && pinStep === 2)) && (
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Confirm ••••"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                    className="input text-center tracking-widest"
                  />
                )}
                {pinError && <p className="text-xs font-medium" style={{ color: "#be123c" }}>{pinError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPinMode(null); setPinInput(""); setPinConfirm(""); setPinError(""); setPinStep(1); }}
                    className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePinSubmit}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl text-white transition-all" style={{ background: "#7c3aed" }}
                  >
                    {pinMode === "remove" ? "Remove" : pinMode === "change" && pinStep === 1 ? "Next" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { href: "/weight", icon: <Scale size={20} />, label: "Weight", bg: "#edfcf2", color: "#0a7140" },
              { href: "/saved-meals", icon: <BookMarked size={20} />, label: "Meals", bg: "#eff6ff", color: "#1d4ed8" },
              { href: "/insights", icon: <BarChart3 size={20} />, label: "Insights", bg: "#fefce8", color: "#854d0e" },
            ].map(({ href, icon, label, bg, color }) => (
              <Link key={href} href={href} className="card p-3 text-center transition-all hover:scale-105" style={{ touchAction: "manipulation" }}>
                <div className="w-9 h-9 rounded-xl mx-auto flex items-center justify-center mb-1.5" style={{ background: bg, color }}>
                  {icon}
                </div>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
              </Link>
            ))}
          </div>

          {/* Switch profile */}
          {profiles.length > 1 && (
            <div className="card overflow-hidden">
              <p className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 border-b border-black/[0.04]">
                Switch profile
              </p>
              <ul className="divide-y divide-black/[0.04]">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setProfile(p)}
                      className="w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-gray-50"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ background: p.id === profile.id ? "linear-gradient(135deg,#0a7140,#3acb7d)" : "#e5e7eb", color: p.id === profile.id ? "white" : "#6b7280" }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex items-center gap-1.5 text-sm font-semibold flex-1">
                        {p.has_pin && <Lock size={11} className="text-violet-400" />}
                        {p.name}
                      </span>
                      {p.id === profile.id && (
                        <span className="text-[10px] px-2 py-0.5 rounded-xl font-bold" style={{ background: "#edfcf2", color: "#0a7140" }}>Active</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/profile/new"
            className="btn-ghost flex items-center justify-center gap-2 w-full py-3 text-sm"
          >
            + Add another profile
          </Link>

          {/* Log out */}
          <button
            onClick={switchProfile}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all"
          >
            <LogOut size={15} />
            Log out / Switch profile
          </button>
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
