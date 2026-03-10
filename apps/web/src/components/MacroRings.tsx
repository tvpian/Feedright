"use client";

interface Ring {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;      // stroke colour
  trackColor: string; // track colour
}

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
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {/* Progress arc */}
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </>
  );
}

export function MacroRings({ calories, calTarget, protein, proteinTarget, carbs, carbsTarget, fat, fatTarget }: Props) {
  const calFraction  = pct(calories, calTarget);
  const protFraction = pct(protein, proteinTarget);
  const carbFraction = pct(carbs, carbsTarget);
  const fatFraction  = pct(fat, fatTarget);

  const remaining = Math.max(Math.round(calTarget - calories), 0);

  // SVG viewport: 200 × 200, calorie ring centred
  return (
    <div className="flex items-center gap-5">
      {/* Calorie ring */}
      <div className="relative flex-shrink-0">
        <svg width={120} height={120} viewBox="0 0 120 120">
          <Ring cx={60} cy={60} r={52} fraction={calFraction} color="#7c3aed" trackColor="#ede9fe" strokeWidth={10} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-900 leading-none">{Math.round(calories)}</span>
          <span className="text-[10px] text-gray-500">kcal</span>
          <span className="text-[10px] text-brand-600 font-semibold mt-0.5">{remaining} left</span>
        </div>
      </div>

      {/* Macro mini-rings */}
      <div className="flex-1 grid grid-cols-3 gap-2">
        {[
          { label: "Protein", value: protein, target: proteinTarget, fraction: protFraction, color: "#0ea5e9", track: "#e0f2fe" },
          { label: "Carbs",   value: carbs,   target: carbsTarget,   fraction: carbFraction, color: "#f59e0b", track: "#fef3c7" },
          { label: "Fat",     value: fat,     target: fatTarget,     fraction: fatFraction,  color: "#10b981", track: "#d1fae5" },
        ].map(({ label, value, target, fraction, color, track }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className="relative">
              <svg width={56} height={56} viewBox="0 0 56 56">
                <Ring cx={28} cy={28} r={22} fraction={fraction} color={color} trackColor={track} strokeWidth={7} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-bold text-gray-800">{Math.round(value)}</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500">{label}</p>
              <p className="text-[10px] text-gray-400">/ {Math.round(target)}g</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
