"use client";

interface Props {
  calories: number;
  calTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
}

function pct(val: number, target: number) {
  if (!target) return 0;
  return Math.min(val / target, 1);
}

/** Single SVG arc ring */
function Ring({ cx, cy, r, fraction, color, trackColor, strokeWidth = 8 }: {
  cx: number; cy: number; r: number; fraction: number;
  color: string; trackColor: string; strokeWidth?: number;
}) {
  const circ = 2 * Math.PI * r;
  const dash = fraction * circ;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </>
  );
}

const MACROS = [
  { key: "protein", label: "Protein", color: "#0ea5e9", track: "#e0f2fe", unit: "g" },
  { key: "carbs",   label: "Carbs",   color: "#f59e0b", track: "#fef3c7", unit: "g" },
  { key: "fat",     label: "Fat",     color: "#10b981", track: "#d1fae5", unit: "g" },
] as const;

export function MacroRings({ calories, calTarget, protein, proteinTarget, carbs, carbsTarget, fat, fatTarget }: Props) {
  const calFraction  = pct(calories, calTarget);
  const remaining    = Math.max(Math.round(calTarget - calories), 0);
  const calOver      = calories > calTarget;

  const macroData = [
    { ...MACROS[0], value: protein, target: proteinTarget, fraction: pct(protein, proteinTarget) },
    { ...MACROS[1], value: carbs,   target: carbsTarget,   fraction: pct(carbs, carbsTarget) },
    { ...MACROS[2], value: fat,     target: fatTarget,     fraction: pct(fat, fatTarget) },
  ];

  return (
    <div
      className="rounded-2xl p-5 text-white relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a7140 0%, #16b05e 60%, #3acb7d 100%)" }}
    >
      {/* Subtle decorative circle */}
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, white, transparent)" }}
      />

      <div className="flex items-center gap-5 relative z-10">
        {/* Calorie ring */}
        <div className="relative flex-shrink-0">
          <svg width={108} height={108} viewBox="0 0 120 120">
            <Ring
              cx={60} cy={60} r={52}
              fraction={calFraction}
              color={calOver ? "#fbbf24" : "rgba(255,255,255,0.95)"}
              trackColor="rgba(255,255,255,0.18)"
              strokeWidth={10}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold leading-none text-white">{Math.round(calories)}</span>
            <span className="text-[10px] font-medium text-white/70 mt-0.5">kcal</span>
            <span className={`text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded-full ${calOver ? "bg-amber-400/30 text-amber-200" : "bg-white/15 text-white"}`}>
              {calOver ? `+${Math.round(calories - calTarget)}` : `${remaining} left`}
            </span>
          </div>
        </div>

        {/* Macro mini-rings */}
        <div className="flex-1 grid grid-cols-3 gap-3">
          {macroData.map(({ label, value, target, fraction, color, track }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <svg width={54} height={54} viewBox="0 0 56 56">
                  <Ring
                    cx={28} cy={28} r={22}
                    fraction={fraction}
                    color="rgba(255,255,255,0.95)"
                    trackColor="rgba(255,255,255,0.18)"
                    strokeWidth={7}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white">{Math.round(value)}</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-white/90">{label}</p>
                <p className="text-[10px] text-white/50">/ {Math.round(target)}g</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

