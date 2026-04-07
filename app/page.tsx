"use client";

import { useState, useEffect } from "react";

type RiskLevel = "Safe" | "Suspicious" | "Scam";

interface AnalysisResult {
  risk: RiskLevel;
  score: number;
  reason: string;
  triggers: string[];
}

interface ScanHistoryItem {
  message: string;
  result: AnalysisResult;
  timestamp: number;
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bg: string; border: string; bar: string; icon: string }
> = {
  Safe: {
    label: "Safe",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bar: "bg-emerald-500",
    icon: "✓",
  },
  Suspicious: {
    label: "Suspicious",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    bar: "bg-amber-500",
    icon: "⚠",
  },
  Scam: {
    label: "Scam",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    bar: "bg-rose-500",
    icon: "✕",
  },
};

const EXAMPLES = [
  "Congratulations! You've won a $500 gift card. Click here to claim before it expires: bit.ly/claim-now",
  "Your bank account has been locked. Verify your identity immediately at secure-bank-login.ru",
  "Hey! Are you free for lunch tomorrow? I found a great new place nearby.",
];

export default function Home() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("scam-scan-history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  const saveToHistory = (msg: string, res: AnalysisResult) => {
    const item: ScanHistoryItem = {
      message: msg.slice(0, 120),
      result: res,
      timestamp: Date.now(),
    };
    const updated = [item, ...history].slice(0, 3);
    setHistory(updated);
    try {
      localStorage.setItem("scam-scan-history", JSON.stringify(updated));
    } catch {}
  };

  const analyze = async (msg: string = message) => {
    if (!msg.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
      setMessage(msg);
      saveToHistory(msg, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const cfg = result ? RISK_CONFIG[result.risk] ?? RISK_CONFIG["Suspicious"] : null;

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white">
      {/* Ambient glow background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-indigo-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white/50 mb-5 tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            AI-Powered Detection
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white/90 to-white/40 bg-clip-text text-transparent mb-3">
            Scam Detector
          </h1>
          <p className="text-white/40 text-sm sm:text-base max-w-sm mx-auto">
            Paste any suspicious message and let AI analyze it for scam patterns instantly.
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 sm:p-6 mb-4 backdrop-blur-sm">
          <label className="block text-xs text-white/40 uppercase tracking-widest mb-3">
            Message to Analyze
          </label>
          <textarea
            id="message-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste an SMS, email, or any suspicious message here..."
            rows={5}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 placeholder-white/20 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
          />

          {/* Example buttons */}
          <div className="flex flex-wrap gap-2 mt-3 mb-4">
            <span className="text-xs text-white/30 self-center">Try:</span>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setMessage(ex); setResult(null); setError(null); }}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1 text-white/50 hover:text-white/80 transition-all"
              >
                Example {i + 1}
              </button>
            ))}
          </div>

          <button
            id="analyze-btn"
            onClick={() => analyze()}
            disabled={loading || !message.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.99]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Analyzing...
              </span>
            ) : (
              "Analyze Message"
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Result Card */}
        {result && cfg && (
          <div
            id="result-card"
            className={`border rounded-2xl p-5 sm:p-6 mb-6 backdrop-blur-sm ${cfg.bg} ${cfg.border} transition-all`}
          >
            {/* Risk badge + score */}
            <div className="flex items-center justify-between mb-5">
              <div className={`flex items-center gap-2.5 ${cfg.color}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${cfg.bg} border ${cfg.border}`}>
                  {cfg.icon}
                </span>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-widest">Risk Level</p>
                  <p className="text-xl font-bold">{result.risk}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-0.5">Scam Score</p>
                <p className={`text-3xl font-bold tabular-nums ${cfg.color}`}>{result.score}</p>
                <p className="text-xs text-white/30">/ 100</p>
              </div>
            </div>

            {/* Score bar */}
            <div className="mb-5">
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-white/20">
                <span>Safe</span>
                <span>Suspicious</span>
                <span>Scam</span>
              </div>
            </div>

            {/* Reason */}
            <div className="mb-4">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1.5">Analysis</p>
              <p className="text-sm text-white/80 leading-relaxed">{result.reason}</p>
            </div>

            {/* Triggers */}
            {result.triggers?.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Trigger Phrases</p>
                <div className="flex flex-wrap gap-2">
                  {result.triggers.map((t, i) => (
                    <span
                      key={i}
                      className={`text-xs px-3 py-1 rounded-full border font-medium ${cfg.bg} ${cfg.border} ${cfg.color}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Recent Scans</p>
            <div className="space-y-2">
              {history.map((item, i) => {
                const hcfg = RISK_CONFIG[item.result.risk] ?? RISK_CONFIG["Suspicious"];
                return (
                  <button
                    key={i}
                    id={`history-item-${i}`}
                    onClick={() => { setMessage(item.message); setResult(item.result); setError(null); }}
                    className="w-full text-left bg-white/[0.02] hover:bg-white/[0.05] border border-white/8 hover:border-white/15 rounded-xl px-4 py-3 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-white/50 truncate flex-1 group-hover:text-white/70 transition-colors">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-semibold ${hcfg.color}`}>
                          {item.result.risk}
                        </span>
                        <span className="text-[10px] text-white/25">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-10">
          Powered by Gemini AI · Results are for informational purposes only
        </p>
      </div>
    </div>
  );
}
