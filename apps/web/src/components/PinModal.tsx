"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  profileName: string;
  /** Called with PIN string. Return true if correct, false to shake. */
  onVerify: (pin: string) => Promise<boolean>;
  onClose: () => void;
}

export function PinModal({ profileName, onVerify, onClose }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first empty input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-submit when all 4 digits filled
  useEffect(() => {
    if (digits.every((d) => d !== "")) {
      submit(digits.join(""));
    }
  }, [digits]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(pin: string) {
    setLoading(true);
    const ok = await onVerify(pin);
    setLoading(false);
    if (!ok) {
      setShake(true);
      setDigits(["", "", "", ""]);
      setTimeout(() => {
        setShake(false);
        inputRefs.current[0]?.focus();
      }, 600);
    }
  }

  function handleChange(idx: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 3) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className={`relative w-80 rounded-2xl bg-zinc-900 border border-zinc-700 p-8 shadow-2xl
          transition-transform ${shake ? "animate-shake" : ""}`}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-500 hover:text-white"
        >
          <X size={18} />
        </button>

        <h2 className="mb-1 text-center text-lg font-semibold text-white">
          {profileName}
        </h2>
        <p className="mb-6 text-center text-sm text-zinc-400">Enter your PIN</p>

        {/* PIN dots row */}
        <div className="flex justify-center gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              disabled={loading}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`h-14 w-12 rounded-xl border text-center text-2xl font-bold
                bg-zinc-800 text-white caret-transparent outline-none
                transition-colors focus:border-violet-500
                ${d ? "border-violet-400" : "border-zinc-600"}
                ${loading ? "opacity-50" : ""}`}
            />
          ))}
        </div>

        {loading && (
          <p className="mt-4 text-center text-sm text-zinc-500 animate-pulse">Verifying…</p>
        )}
      </div>

      {/* shake keyframe */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
