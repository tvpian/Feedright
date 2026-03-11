"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { WeightEntry } from "@/lib/types";
import { format } from "date-fns";

export default function WeightPage() {
  const { profile } = useUser();
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    api.weight.history(profile.id, days).then(setEntries).finally(() => setLoading(false));
  }, [profile, days]);

  async function handleLog() {
    if (!profile || !weightKg) return;
    setSaving(true);
    try {
      const entry = await api.weight.log(profile.id, {
        weight_kg: parseFloat(weightKg),
        log_date: format(new Date(), "yyyy-MM-dd"),
        notes,
      });
      setEntries((prev) => {
        const filtered = prev.filter((e) => e.log_date !== entry.log_date);
        return [...filtered, entry].sort((a, b) => a.log_date.localeCompare(b.log_date));
      });
      setWeightKg("");
      setNotes("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.weight.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (!profile) {
    return <div className="p-6 text-center text-gray-500">Create a profile first.</div>;
  }

  const minW = entries.length ? Math.min(...entries.map((e) => e.weight_kg)) : 0;
  const maxW = entries.length ? Math.max(...entries.map((e) => e.weight_kg)) : 100;
  const range = Math.max(maxW - minW, 1);
  const latest = entries.length ? entries[entries.length - 1].weight_kg : null;
  const first = entries.length ? entries[0].weight_kg : null;
  const change = latest !== null && first !== null ? latest - first : 0;

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
      <h1 className="text-2xl font-extrabold tracking-tight mb-0.5">Weight Tracker</h1>
      <p className="text-gray-400 text-sm mb-6">Track your weight over time</p>

      {/* Quick Log */}
      <div className="card p-5 mb-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-700">Log Today&apos;s Weight</h2>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 72.5"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="input flex-1"
          />
          <span className="text-sm font-semibold text-gray-400">kg</span>
        </div>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
        />
        <button
          onClick={handleLog}
          disabled={saving || !weightKg}
          className="btn-primary w-full py-3 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Log Weight"}
        </button>
      </div>

      {/* Stats */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Current" value={`${latest?.toFixed(1)} kg`} />
          <StatCard label="Start" value={`${first?.toFixed(1)} kg`} />
          <StatCard
            label="Change"
            value={`${change >= 0 ? "+" : ""}${change.toFixed(1)} kg`}
            color={change < 0 ? "text-green-600" : change > 0 ? "text-red-500" : "text-gray-600"}
          />
        </div>
      )}

      {/* Chart */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Trend</h2>
          <div className="flex gap-1.5">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="px-2.5 py-1 text-xs rounded-xl font-bold transition-all"
                style={days === d
                  ? { background: "linear-gradient(135deg,#0a7140,#3acb7d)", color: "white" }
                  : { background: "#f3f4f6", color: "#6b7280" }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {entries.length < 2 ? (
          <p className="text-sm text-gray-400 text-center py-8">Log at least 2 entries to see a trend.</p>
        ) : (
          <div className="relative h-40">
            <svg viewBox={`0 0 ${entries.length * 40} 160`} className="w-full h-full" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                <line
                  key={pct}
                  x1="0" x2={entries.length * 40}
                  y1={10 + 140 * pct} y2={10 + 140 * pct}
                  stroke="#f3f4f6" strokeWidth="1"
                />
              ))}
              {/* Gradient fill */}
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0a7140" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0a7140" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                fill="url(#weightGrad)"
                stroke="none"
                points={[...entries.map((e, i) => {
                  const x = i * 40 + 20;
                  const y = 10 + 140 * (1 - (e.weight_kg - minW) / range);
                  return `${x},${y}`;
                }), `${(entries.length - 1) * 40 + 20},150`, `20,150`].join(" ")}
              />
              {/* Line */}
              <polyline
                fill="none"
                stroke="#0a7140"
                strokeWidth="2.5"
                strokeLinejoin="round"
                points={entries
                  .map((e, i) => {
                    const x = i * 40 + 20;
                    const y = 10 + 140 * (1 - (e.weight_kg - minW) / range);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
              {/* Dots */}
              {entries.map((e, i) => {
                const x = i * 40 + 20;
                const y = 10 + 140 * (1 - (e.weight_kg - minW) / range);
                return <circle key={e.id} cx={x} cy={y} r="4" fill="white" stroke="#0a7140" strokeWidth="2" />;
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-2">
              <span>{entries[0]?.log_date}</span>
              <span>{entries[entries.length - 1]?.log_date}</span>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <h2 className="text-sm font-bold text-gray-700 p-4 border-b border-black/[0.04]">History</h2>
        {loading ? (
          <p className="p-4 text-sm text-gray-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <span className="text-sm font-bold">{e.weight_kg.toFixed(1)} kg</span>
                  <span className="text-xs text-gray-400 ml-2">{e.log_date}</span>
                  {e.notes && <span className="text-xs text-gray-400 ml-2">— {e.notes}</span>}
                </div>
                <button onClick={() => handleDelete(e.id)} className="text-xs font-semibold px-2.5 py-1 rounded-xl transition-all" style={{ color: "#be123c", background: "#fff1f2" }}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "text-gray-800" }: { label: string; value: string; color?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
