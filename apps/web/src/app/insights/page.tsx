"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useUser } from "@/lib/userContext";
import type { TrendResponse, StreakInfo, WeeklyAverages, FavoriteFood, DailyTargets } from "@/lib/types";
import { NUTRIENT_LABELS, NUTRIENT_UNITS } from "@/lib/types";
import { NutrientTrendChart } from "@/components/NutrientTrendChart";

import { Download } from "lucide-react";

type Tab = "trends" | "averages" | "favorites";

export default function InsightsPage() {
  const { profile } = useUser();
  const [tab, setTab] = useState<Tab>("trends");
  const [days, setDays] = useState(7);
  const [trends, setTrends] = useState<TrendResponse | null>(null);
  const [streaks, setStreaks] = useState<StreakInfo | null>(null);
  const [averages, setAverages] = useState<WeeklyAverages | null>(null);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [loading, setLoading] = useState(true);

  // Nutrient selection for chart
  const [selectedNutrient, setSelectedNutrient] = useState("calories");

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    Promise.all([
      api.analytics.trends(profile.id, days),
      api.analytics.streaks(profile.id),
      api.analytics.averages(profile.id, days),
      api.analytics.favorites(profile.id),
      api.targets.get(profile.id),
    ])
      .then(([t, s, a, f, tg]) => {
        setTrends(t);
        setStreaks(s);
        setAverages(a);
        setFavorites(f);
        setTargets(tg);
      })
      .finally(() => setLoading(false));
  }, [profile, days]);

  if (!profile) {
    return <div className="p-6 text-center text-gray-500">Create a profile first.</div>;
  }
  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading insights…</div>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-10">
      <div className="flex items-start justify-between mb-0.5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Insights</h1>
          <p className="text-gray-400 text-sm mb-5">Your nutrition analytics &amp; patterns</p>
        </div>
        <div className="flex gap-1.5">
          <a
            href={`/api/analytics/${profile.id}/export?fmt=csv&days=${days}`}
            download
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
          >
            <Download size={13} /> CSV
          </a>
          <a
            href={`/api/analytics/${profile.id}/export?fmt=json&days=${days}`}
            download
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
          >
            <Download size={13} /> JSON
          </a>
        </div>
      </div>

      {/* Streaks Card */}
      {streaks && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Current Streak" value={`${streaks.current_streak}d`} icon="🔥" bg="#fff7ed" color="#9a3412" />
          <StatCard label="Best Streak" value={`${streaks.longest_streak}d`} icon="🏆" bg="#fefce8" color="#854d0e" />
          <StatCard label="Days Logged" value={`${streaks.total_logged_days}`} icon="📊" bg="#edfcf2" color="#0a7140" />
        </div>
      )}

      {/* Time Period Selector */}
      <div className="flex gap-2 mb-5">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-4 py-2 text-xs rounded-xl font-bold transition-all"
            style={days === d
              ? { background: "linear-gradient(135deg,#0a7140,#3acb7d)", color: "white", boxShadow: "0 2px 8px rgba(12,143,74,0.25)" }
              : { background: "#f3f4f6", color: "#6b7280" }}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-2xl p-1 mb-5">
        {([ ["trends", "Trends"], ["averages", "Averages"], ["favorites", "Top Foods"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2 text-xs font-bold rounded-xl transition-all"
            style={tab === key ? { background: "white", color: "#0a7140", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" } : { color: "#9ca3af" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Nutrient Trends */}
      {tab === "trends" && trends && (
        <div className="space-y-4">
          {/* Multi-nutrient overview chart */}
          <div className="card p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Daily targets hit (%)</h3>
            <NutrientTrendChart
              trends={trends}
              targets={targets?.targets ? (targets.targets as unknown as Record<string, number>) : {}}
            />
          </div>

          {/* Single-nutrient drill-down */}
          {/* Nutrient picker */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(NUTRIENT_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedNutrient(key)}
                className="px-2.5 py-1 text-xs rounded-xl font-semibold transition-all"
                style={selectedNutrient === key
                  ? { background: "linear-gradient(135deg,#0a7140,#3acb7d)", color: "white" }
                  : { background: "#f3f4f6", color: "#6b7280" }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <TrendChart
            snapshots={trends.snapshots}
            nutrientKey={selectedNutrient}
            target={targets?.targets ? (targets.targets as any)[selectedNutrient] : undefined}
          />
        </div>
      )}

      {/* Tab: Averages & Alerts */}
      {tab === "averages" && averages && (
        <div className="space-y-4">
          {averages.low_nutrients.length > 0 && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <h3 className="text-sm font-bold" style={{ color: "#92400e" }}>⚠️ Consistently Low Nutrients</h3>
              <p className="text-xs" style={{ color: "#b45309" }}>Below 60% of target over {days} days:</p>
              <div className="flex flex-wrap gap-1.5">
                {averages.low_nutrients.map((n) => (
                  <span key={n} className="px-2.5 py-1 text-xs font-bold rounded-xl" style={{ background: "#fef3c7", color: "#92400e" }}>
                    {NUTRIENT_LABELS[n] || n}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <h3 className="text-sm font-bold text-gray-700 p-4 border-b border-black/[0.04]">Daily Averages ({days}d)</h3>
            <ul className="divide-y divide-black/[0.04]">
              {Object.entries(NUTRIENT_LABELS).map(([key, label]) => {
                const avg = averages.averages[key] || 0;
                const target = targets?.targets ? (targets.targets as any)[key] : 0;
                const pct = target > 0 ? (avg / target) * 100 : 0;
                const isLow = averages.low_nutrients.includes(key);
                return (
                  <li key={key} className={`px-4 py-3 ${isLow ? "" : ""}`} style={isLow ? { background: "#fffbeb" } : {}}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-semibold" style={{ color: isLow ? "#b45309" : "#374151" }}>{label}</span>
                      <span className="text-gray-400 text-xs">
                        {avg.toFixed(1)} / {target.toFixed(1)} {NUTRIENT_UNITS[key] || ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: pct >= 90 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444"
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Tab: Top Foods */}
      {tab === "favorites" && (
        <div className="space-y-2.5">
          {favorites.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-2xl mb-2">🥗</p>
              <p className="text-sm text-gray-400">No logged foods yet.</p>
            </div>
          ) : (
            favorites.map((f, i) => (
              <div key={f.food_id} className="card-hover flex items-center gap-3 px-4 py-3.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0"
                  style={i === 0 ? { background: "#fef3c7", color: "#92400e" } : i === 1 ? { background: "#f3f4f6", color: "#6b7280" } : { background: "#fff7ed", color: "#c2410c" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{f.food_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Logged {f.count}× · last: {f.last_logged}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon, bg, color }: { label: string; value: string; icon: string; bg: string; color: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mx-auto mb-1" style={{ background: bg }}>
        {icon}
      </div>
      <div className="text-base font-extrabold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-gray-400 font-medium mt-0.5">{label}</div>
    </div>
  );
}

function TrendChart({
  snapshots,
  nutrientKey,
  target,
}: {
  snapshots: { log_date: string; nutrient_totals: Record<string, number>; calorie_total: number }[];
  nutrientKey: string;
  target?: number;
}) {
  const values = snapshots.map((s) =>
    nutrientKey === "calories" ? s.calorie_total : (s.nutrient_totals[nutrientKey] || 0)
  );
  const max = Math.max(...values, target || 0, 1);
  const unit = NUTRIENT_UNITS[nutrientKey] || "";
  const label = NUTRIENT_LABELS[nutrientKey] || nutrientKey;

  const W = snapshots.length * 50;
  const H = 180;
  const PAD = 20;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-700">{label}</h3>
        {target && (
          <span className="text-xs text-gray-400">Target: {target.toFixed(1)} {unit}</span>
        )}
      </div>
      {snapshots.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full min-w-[300px]" style={{ height: H + 30 }}>
            {/* Grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
              <line key={pct} x1={PAD} x2={W - PAD} y1={PAD + (H - 2 * PAD) * pct} y2={PAD + (H - 2 * PAD) * pct} stroke="#f3f4f6" strokeWidth="1" />
            ))}

            {/* Target line */}
            {target && target > 0 && (
              <line
                x1={PAD} x2={W - PAD}
                y1={PAD + (H - 2 * PAD) * (1 - target / max)}
                y2={PAD + (H - 2 * PAD) * (1 - target / max)}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6,4"
              />
            )}

            {/* Bars */}
            {values.map((v, i) => {
              const barW = Math.max((W - 2 * PAD) / snapshots.length - 6, 8);
              const x = PAD + i * ((W - 2 * PAD) / snapshots.length) + 3;
              const barH = (v / max) * (H - 2 * PAD);
              const y = PAD + (H - 2 * PAD) - barH;
              const pct = target ? (v / target) * 100 : 100;
              const fill = pct >= 90 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW} height={barH} rx={3} fill={fill} opacity={0.85} />
                  <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="8" fill="#6b7280">
                    {v < 10 ? v.toFixed(1) : Math.round(v)}
                  </text>
                </g>
              );
            })}

            {/* Date labels */}
            {snapshots.map((s, i) => {
              const barW = (W - 2 * PAD) / snapshots.length;
              const x = PAD + i * barW + barW / 2;
              return (
                <text key={i} x={x} y={H + 12} textAnchor="middle" fontSize="8" fill="#9ca3af">
                  {s.log_date.slice(5)}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
