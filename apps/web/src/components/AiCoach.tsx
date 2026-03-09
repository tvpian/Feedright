"use client";

import { useState, useRef, useMemo } from "react";
import { Sparkles, ChevronDown, ChevronUp, Send, RefreshCw } from "lucide-react";

interface Props {
  userId: string;
  date: string;
}

// Call FastAPI directly to guarantee streaming works (bypasses Next.js rewrite buffering)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const QUICK_QUESTIONS = [
  "What should I eat to hit my goals today?",
  "Do I need any supplements?",
  "Am I on track for my goals?",
];

export function AiCoach({ userId, date }: Props) {
  const [open, setOpen]           = useState(false);
  const [question, setQuestion]   = useState("");
  const [response, setResponse]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const abortRef    = useRef<AbortController | null>(null);
  // Buffer streaming tokens and flush to state at most every 80ms
  // This prevents a React re-render (and input stutter) on every single token
  const bufferRef   = useRef("");
  const flushRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ask(overrideQuestion?: string) {
    if (loading) {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }

    const q = overrideQuestion ?? (question.trim() || undefined);
    setResponse("");
    setError("");
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const params = new URLSearchParams({ date });
      if (q) params.set("question", q);

      const res = await fetch(`${API_BASE}/api/advisor/${userId}/coach?${params}`, {
        method: "POST",
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResponse((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(
          e?.message?.includes("fetch")
            ? "Cannot reach the AI coach. Make sure Ollama is running (ollama serve)."
            : e?.message || "Something went wrong."
        );
      }
    } finally {
      // Stop interval, do one final flush so the complete response is shown
      if (flushRef.current) clearInterval(flushRef.current);
      setResponse(bufferRef.current);
      setLoading(false);
    }
  }

  function handleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    // Auto-fetch on first open
    if (willOpen && !response && !loading) ask();
  }

  // Render the text response: **bold headers**, bullet lines, plain paragraphs
  // Memoised so it only re-runs when `response` changes, not on every render
  const renderedResponse = useMemo(() => renderResponseText(response), [response]);

  function renderResponseText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Full-line bold header: **text**
      const fullBold = line.match(/^\*\*(.*)\*\*$/);
      if (fullBold) {
        return (
          <p key={i} className="font-semibold text-gray-800 mt-3 first:mt-0 mb-0.5 text-xs">
            {fullBold[1]}
          </p>
        );
      }

      // Inline bold within a line
      const parts = line.split(/\*\*(.*?)\*\*/g);
      const rendered = parts.map((p, j) =>
        j % 2 === 1 ? <strong key={j} className="font-semibold text-gray-800">{p}</strong> : p
      );

      // Bullet line
      if (/^[-•*]\s/.test(line)) {
        return (
          <div key={i} className="flex gap-1.5 text-xs text-gray-700 leading-relaxed">
            <span className="text-brand-500 mt-0.5 shrink-0 select-none">•</span>
            <span>{rendered.map((p, j) => (typeof p === "string" ? p.replace(/^[-•*]\s/, "") : p))}</span>
          </div>
        );
      }

      // Blank line → small gap
      if (!line.trim()) return <div key={i} className="h-1" />;

      // Normal paragraph
      return (
        <p key={i} className="text-xs text-gray-700 leading-relaxed">
          {rendered}
        </p>
      );
    });
  }

  return (
    <div className="bg-gradient-to-br from-violet-50 via-brand-50 to-indigo-50 border border-brand-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-white/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles size={15} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">AI Coach</p>
            <p className="text-[11px] text-gray-500">
              {loading ? "Analysing your nutrition…" : response ? "Tap to view your advice" : "Personalised advice for your goals"}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp  size={16} className="text-gray-400 shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Response / loading area */}
          {(loading || response) && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3.5 space-y-0.5 min-h-[56px]">
              {response ? (
                <>
                  {renderedResponse}
                  {/* Blinking cursor while streaming */}
                  {loading && (
                    <span className="inline-block w-1 h-3.5 bg-brand-400 animate-pulse rounded-sm align-text-bottom ml-0.5" />
                  )}
                </>
              ) : (
                /* Thinking dots */
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">Analysing your nutrition…</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{error}</p>
          )}

          {/* Quick question chips — show before first response */}
          {!response && !loading && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setQuestion(q); ask(q); }}
                  className="px-2.5 py-1 bg-white/80 border border-gray-200 rounded-full text-[11px] text-gray-600 hover:border-brand-400 hover:text-brand-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Custom question + submit */}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) ask(); }}
              placeholder="Ask something specific…"
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white/80 placeholder-gray-400"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => (loading ? (abortRef.current?.abort(), setLoading(false)) : ask())}
              className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
                loading
                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              }`}
            >
              {loading ? "Stop" : <><Send size={12} /> Ask</>}
            </button>
          </div>

          {/* Refresh link after first response */}
          {response && !loading && (
            <button
              type="button"
              onClick={() => ask()}
              className="flex items-center gap-1 text-[11px] text-brand-600 hover:underline"
            >
              <RefreshCw size={10} /> Refresh advice
            </button>
          )}
        </div>
      )}
    </div>
  );
}
