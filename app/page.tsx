"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// --- Voice Recognition Types ---
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  results: {
    length: number;
    [key: number]: {
      length: number;
      [key: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
  };
  resultIndex: number;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { 
  RiskLevel, 
  ScamType, 
  Confidence, 
  Persona, 
  DetectedUrl, 
  UrlVerdict, 
  AnalysisResult 
} from "@/lib/scam-logic";

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
    label: "✅ SAFE",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bar: "bg-emerald-500",
    icon: "✓",
  },
  Suspicious: {
    label: "🔍 SUSPICIOUS",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    bar: "bg-amber-500",
    icon: "⚠",
  },
  Scam: {
    label: "⚠️ HIGH RISK",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    bar: "bg-rose-500",
    icon: "✕",
  },
};

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  High: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Low: "bg-white/10 text-white/50 border-white/20",
};

const TAG_STYLES: Record<string, string> = {
  Urgency: "bg-rose-500/15 border-rose-500/30 text-rose-300",
  Fear: "bg-rose-500/15 border-rose-500/30 text-rose-300",
  "Financial Lure": "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  Reward: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  "Suspicious Link": "bg-orange-500/15 border-orange-500/30 text-orange-300",
  Impersonation: "bg-purple-500/15 border-purple-500/30 text-purple-300",
};

const URL_VERDICT_STYLES: Record<UrlVerdict, string> = {
  "Suspicious Domain": "bg-rose-500/15 border-rose-500/30 text-rose-300",
  "Not Official Domain": "bg-orange-500/15 border-orange-500/30 text-orange-300",
  Safe: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
};

const PERSONAS: Persona[] = ["General", "Student", "Elderly", "Employee"];

const EXAMPLES = [
  "Congratulations! You've won a $500 gift card. Click here to claim before it expires: bit.ly/claim-now",
  "Your bank account has been locked. Verify your identity immediately at secure-bank-login.ru",
  "Hey! Are you free for lunch tomorrow? I found a great new place nearby.",
];

function HomeContent() {
  function getConsequence(result: AnalysisResult | null) {
    if (!result) return ""

    const type = result.type?.toLowerCase() || ""
    const patterns = result.patterns || { urgency: false, fear: false, reward: false }

    if (type.includes("phishing") || patterns.urgency) {
      return "This can trick you into giving sensitive details within seconds."
    }

    if (type.includes("otp")) {
      return "Sharing your OTP can lead to instant account takeover."
    }

    if (type.includes("lottery") || patterns.reward) {
      return "You may lose money by paying fake fees for a non-existent reward."
    }

    return "Interacting with this message may expose your personal or financial information."
  }

  function getPressureWarning(result: AnalysisResult | null) {
    if (!result) return ""

    const tags = result.tags || []
    const patterns = result.patterns || { urgency: false, fear: false, reward: false }

    if (
      tags.includes("Urgency") ||
      tags.includes("Fear") ||
      patterns.urgency ||
      patterns.fear
    ) {
      return "This message is trying to rush or pressure you."
    }

    if (
      tags.includes("Financial Lure") ||
      patterns.reward
    ) {
      return "This message is tempting you with rewards to manipulate you."
    }

    return ""
  }

  function getPersonaInsight(result: AnalysisResult | null, persona: Persona) {
    if (!result || !persona) return ""

    const type = result.type?.toLowerCase() || ""

    if (persona === "Student" && type.includes("job")) {
      return "This scam often targets students with fake job or internship offers."
    }

    if (persona === "Elderly" && type.includes("phishing")) {
      return "This type of scam frequently targets elderly users by impersonating trusted institutions."
    }

    if (persona === "Employee" && type.includes("otp")) {
      return "Employees are often targeted through OTP or account verification scams."
    }

    if (type.includes("lottery")) {
      return "This scam targets users by exploiting excitement and reward-based thinking."
    }

    return "This scam can affect anyone if proper caution is not taken."
  }

  const searchParams = useSearchParams();
  const [message, setMessage] = useState("");
  const [persona, setPersona] = useState<Persona>("General");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [aiProvider, setAiProvider] = useState<"anthropic" | "gemini" | "fallback" | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [timelineStep, setTimelineStep] = useState(0);
  const [resultVisible, setResultVisible] = useState(false);
  const [inputType, setInputType] = useState<"Message" | "Link" | "Phone">("Message");
  const [simulateMode, setSimulateMode] = useState(false);
  const [inputWarning, setInputWarning] = useState("");
  const [platform, setPlatform] = useState("SMS");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [panicOpen, setPanicOpen] = useState(false);

  // Screenshot States
  const [activeTab, setActiveTab] = useState<"text" | "image">("text");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractionStep, setExtractionStep] = useState<0 | 1>(0); // 0: Extracting, 1: Analyzing
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [showExtractedText, setShowExtractedText] = useState(false);

  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fill from URL query param
  useEffect(() => {
    const msg = searchParams.get("msg");
    if (msg) {
      const decoded = decodeURIComponent(msg);
      setMessage(decoded);
      // Auto-analyze after a short delay to ensure UI is ready
      setTimeout(() => {
        analyze(decoded);
      }, 500);
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("scam-scan-history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  // Detect input type as user types
  useEffect(() => {
    const trimmed = message.trim();
    if (!trimmed) { setInputType("Message"); return; }
    const hasUrl = /https?:\/\/|www\.|\S+\.(com|in|org|net|io|co|gov|edu)([\/\s]|$)/i.test(trimmed);
    const hasPhone = /(?:\+91[\s-]?)?[6-9]\d{9}|\+?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d/.test(trimmed);
    if (hasUrl) setInputType("Link");
    else if (hasPhone) setInputType("Phone");
    else setInputType("Message");
  }, [message]);

  const LOADING_STEPS = [
    "Analyzing message...",
    "Detecting patterns...",
    "Checking scam signals...",
  ];

  // Rotate loading step text every 1 second while loading
  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Advance detection timeline every 800ms while loading; reset when not
  useEffect(() => {
    if (!loading) return;
    setTimelineStep(0);
    const interval = setInterval(() => {
      setTimelineStep((s) => (s < 3 ? s + 1 : s));
    }, 800);
    return () => clearInterval(interval);
  }, [loading]);

  // Animate score bar from 0 → result.score whenever result changes
  useEffect(() => {
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    setAnimatedScore(0);
    if (result) {
      scoreTimerRef.current = setTimeout(() => setAnimatedScore(result.score), 50);
    }
    return () => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current); };
  }, [result]);

  useEffect(() => {
    if (result?.risk === "Scam") {
      setPanicOpen(true);
    }
  }, [result]);

  // Mini stats derived from history
  const stats = useMemo(() => {
    const total = history.length;
    const scams = history.filter((h) => h.result.risk === "Scam").length;
    const typeCounts: Record<string, number> = {};
    history.forEach((h) => {
      if (h.result.type) typeCounts[h.result.type] = (typeCounts[h.result.type] || 0) + 1;
    });
    const commonType =
      Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    return { total, scams, commonType };
  }, [history]);

  const saveToHistory = (msg: string, res: AnalysisResult) => {
    const item: ScanHistoryItem = {
      message: msg.slice(0, 120),
      result: res,
      timestamp: Date.now(),
    };
    const updated = [item, ...history].slice(0, 10);
    setHistory(updated);
    try {
      localStorage.setItem("scam-scan-history", JSON.stringify(updated));
    } catch {}
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice input not supported in this browser");
      setTimeout(() => setVoiceError(null), 3000);
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += (event.results as any)[i][0].transcript;
        }
        setMessage(transcript);
        
        // Reset silence timer on every result
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop();
        }, 10000);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setVoiceError(`Error: ${event.error}`);
        setIsListening(false);
        setTimeout(() => setVoiceError(null), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      recognitionRef.current = recognition;
    }

    setVoiceError(null);
    setIsListening(true);
    try {
      recognitionRef.current.start();
      // Initial silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognitionRef.current?.stop();
      }, 10000);
    } catch (e) {
      console.error("Speech recognition start failed:", e);
      setIsListening(false);
    }
  };

  const analyze = async (msg: string = message) => {
    if (!msg.trim()) {
      setInputWarning("Please enter a message to analyze");
      return;
    }

    if (msg.trim().length < 10) {
      setInputWarning("Message too short to analyze properly");
      return;
    }

    if (!/(urgent|click|win|offer|account|verify|link|bank|otp)/i.test(msg)) {
      setInputWarning("⚠️ This message may not contain typical scam indicators");
    } else {
      setInputWarning("");
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setResultVisible(false);
    setCopied(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, persona, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAiProvider((res.headers.get("X-AI-Provider") as "anthropic" | "gemini" | "fallback") ?? null);
      setResult(data);
      setMessage(msg);
      saveToHistory(msg, data);
      setTimelineStep(4); // mark all steps complete
      // Trigger fade-in on next paint
      setTimeout(() => {
        setResultVisible(true);
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Image is too large (max 5MB)");
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeScreenshot = async () => {
    if (!selectedImage || !imagePreview) return;

    setLoading(true);
    setExtractionStep(0);
    setError(null);
    setResult(null);
    setExtractedText(null);
    setResultVisible(false);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: selectedImage.type,
          persona,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      setExtractionStep(1); // Moving to analysis step animation
      setExtractedText(data.extractedText);
      setAiProvider((res.headers.get("X-AI-Provider") as "anthropic" | "gemini" | "fallback") ?? null);
      setMessage(data.extractedText); // Pre-fill message with extracted text
      setResult(data.analysis);
      saveToHistory(data.extractedText, data.analysis);
      setTimelineStep(4);

      setTimeout(() => {
        setResultVisible(true);
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const copyReport = async () => {
    if (!result) return;

    const lines: string[] = [
      `---`,
      `🚨 Scam Analysis Report`,
      ``,
      `Message:`,
      message,
      ``,
      `Risk:`,
      `${RISK_CONFIG[result.risk]?.label ?? result.risk} (${result.score}%)`,
      ``,
      `Type:`,
      result.type,
      ``,
      `Confidence:`,
      result.confidence,
      ``,
      `Reason:`,
      result.reason,
    ];

    if (result.tags && result.tags.length > 0) {
      lines.push(``, `Tags:`, result.tags.join(", "));
    }

    if (result.advice?.length > 0) {
      lines.push(``, `Advice:`, ...result.advice.map((a) => `- ${a}`));
    }

    if (result.urls && result.urls.length > 0) {
      lines.push(``, `URLs:`, ...result.urls.map((u) => `- ${u.url} → ${u.verdict}`));
    }

    lines.push(``, `---`);

    const report = lines.join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    if (!result) return;

    const report = `
🚨 Scam Analysis Report

Message:
${message}

Risk:
${cfg?.label || result.risk} (${result.score}%)

Type:
${result.type}

Confidence:
${result.confidence}

Reason:
${result.reason}

Tags:
${result.tags?.join(", ") || "None"}

Advice:
${result.advice?.map((a) => "- " + a).join("\n") || "None"}

URLs:
${result.urls?.map((u) => "- " + u.url + " → " + u.verdict).join("\n") || "None"}

Generated by AI Scam Detector
    `;

    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `scam-report-${Date.now()}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const cfg = result ? RISK_CONFIG[result.risk] ?? RISK_CONFIG["Suspicious"] : null;

  const showActionButtons =
    result && (result.risk === "Suspicious" || result.risk === "Scam");

  // Build a natural-language narrative from existing result data
  const buildStoryNarrative = (r: AnalysisResult): string => {
    const parts: string[] = [];

    // Opening: what the message does
    if (r.tags && r.tags.length > 0) {
      const tagList = r.tags.join(", ").toLowerCase();
      parts.push(`This message employs ${tagList} tactics to manipulate the recipient.`);
    } else {
      parts.push("This message contains patterns that warrant closer inspection.");
    }

    // Middle: scam type context
    const typeDescriptions: Partial<Record<ScamType, string>> = {
      Phishing: "It impersonates a legitimate service to steal personal information.",
      Lottery: "It promises a prize or reward that does not exist to lure victims.",
      "OTP Fraud": "It attempts to obtain a one-time password to access your accounts.",
      "Job Scam": "It offers a fake job opportunity to extract money or personal data.",
      Unknown: "The exact scam type is unclear, but suspicious signals are present.",
    };
    if (r.type && typeDescriptions[r.type]) {
      parts.push(typeDescriptions[r.type]!);
    }

    // Closing: pull key insight from the AI reason
    if (r.reason) {
      // Use the reason as-is if short, or trim to first sentence
      const firstSentence = r.reason.split(/\.\s+/)[0];
      parts.push(firstSentence.endsWith(".") ? firstSentence : firstSentence + ".");
    }

    return parts.join(" ");
  };

  const handleReset = () => {
    if (result && !confirm("Clear current scan?")) return;
    setMessage("");
    setResult(null);
    setError(null);
    setLoading(false);
    setResultVisible(false);
    setTimelineStep(0);
    setInputWarning("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

        {/* Mini Stats Bar */}
        {stats.total > 0 && (
          <div className="flex items-center justify-center gap-6 bg-white/[0.03] border border-white/8 rounded-xl px-5 py-2.5 mb-4 text-xs text-white/40">
            <div className="flex items-center gap-1.5">
              <span className="text-white/20">📊</span>
              <span className="text-white/60 font-medium">{stats.total}</span> Scans
            </div>
            <div className="w-px h-3.5 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-white/20">🚨</span>
              <span className="text-rose-400 font-medium">{stats.scams}</span> Scams
            </div>
            <div className="w-px h-3.5 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-white/20">🏷️</span>
              <span className="text-white/60 font-medium">{stats.commonType}</span>
            </div>
          </div>
        )}

        {/* ── TAB SWITCHER ── */}
        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 mb-4 backdrop-blur-sm">
          <button
            onClick={() => setActiveTab("text")}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === "text" ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
            }`}
          >
            <span>📝</span> Paste Text
          </button>
          <button
            onClick={() => setActiveTab("image")}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === "image" ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
            }`}
          >
            <span>📸</span> Scan Screenshot
          </button>
        </div>

        {/* Input Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 sm:p-6 mb-4 backdrop-blur-sm">
          {/* Persona selector row stays common */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/40 uppercase tracking-widest font-semibold">
                {activeTab === "text" ? "Analyze Message" : "Analyze Screenshot"}
              </label>
              <div className="flex items-center gap-2">
                {activeTab === "text" && (
                  <button
                    onClick={() => setSimulateMode(!simulateMode)}
                    className={`px-3 py-1 text-[10px] rounded-lg border transition-all flex items-center gap-1.5
                      ${simulateMode 
                        ? "bg-red-500/20 text-red-300 border-red-500/40" 
                        : "border-white/10 text-white/50 hover:text-white hover:bg-white/10"}
                    `}
                  >
                    ⚠️ Simulate Attack
                  </button>
                )}
                {(message || selectedImage || result) && (
                  <button
                    onClick={() => {
                      handleReset();
                      setSelectedImage(null);
                      setImagePreview(null);
                      setExtractedText(null);
                    }}
                    className="px-3 py-1 text-[10px] rounded-lg border border-white/10 
                               text-white/50 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5"
                  >
                    🔄 Clear All
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  id="platform-select"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-3 pr-7 py-1 text-xs text-white/60 focus:outline-none focus:border-violet-500/50 cursor-pointer transition-colors hover:bg-white/10"
                >
                  <option className="bg-[#1a1a1f] text-white">SMS</option>
                  <option className="bg-[#1a1a1f] text-white">WhatsApp</option>
                  <option className="bg-[#1a1a1f] text-white">Email</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <div className="relative">
                <select
                  id="persona-select"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as Persona)}
                  className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-3 pr-7 py-1 text-xs text-white/60 focus:outline-none focus:border-violet-500/50 cursor-pointer transition-colors hover:bg-white/10"
                >
                  {PERSONAS.map((p) => (
                    <option key={p} value={p} className="bg-[#1a1a1f] text-white">
                      {p}
                    </option>
                  ))}
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {activeTab === "text" ? (
            <>
              <div className="relative group">
                <textarea
                  id="message-input"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setInputWarning("");
                  }}
                  placeholder={
                    platform === "SMS"
                      ? "Paste SMS message..."
                      : platform === "WhatsApp"
                      ? "Paste WhatsApp message..."
                      : "Paste email content..."
                  }
                  rows={5}
                  className={`w-full p-4 pr-12 rounded-xl bg-white/5 text-white text-sm placeholder-white/20 resize-none focus:outline-none border-2 transition-all duration-300 ${
                    inputType === "Link"
                      ? "border-blue-500"
                      : inputType === "Phone"
                      ? "border-purple-500"
                      : "border-gray-500"
                  }`}
                />
                <button
                  onClick={toggleListening}
                  className={`absolute bottom-3 right-3 p-2.5 rounded-full transition-all duration-300 z-10 ${
                    isListening 
                      ? "bg-rose-500 text-white animate-pulse ring-4 ring-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.5)]" 
                      : "bg-white/10 text-white/40 hover:bg-white/20 hover:text-white"
                  }`}
                  title={isListening ? "Stop Recording" : "Start Voice Input"}
                >
                  {isListening ? "🔴" : "🎙️"}
                </button>
              </div>

              {isListening && (
                <div className="mt-2 text-[10px] text-rose-400 flex items-center gap-1.5 animate-pulse font-medium uppercase tracking-widest px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Listening...
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {!imagePreview ? (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/10 rounded-xl hover:border-violet-500/50 hover:bg-white/[0.02] transition-all cursor-pointer group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="p-3 bg-white/5 rounded-full mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-2xl">📸</span>
                    </div>
                    <p className="text-sm text-white/60">
                      <span className="font-semibold text-white/90">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-white/30 mt-1">PNG, JPG or WebP (Max 5MB)</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                </label>
              ) : (
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 group">
                  <img src={imagePreview} alt="Preview" className="w-full h-auto max-h-[200px] object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => {
                        setSelectedImage(null);
                        setImagePreview(null);
                      }}
                      className="p-2 bg-rose-500 rounded-full text-white shadow-lg transform hover:scale-110 transition-transform"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {selectedImage && !loading && !result && (
                <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                  <span className="text-[10px] text-white/40 truncate flex-1 mr-2">{selectedImage.name}</span>
                  <span className="text-[10px] text-white/20">{(selectedImage.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              )}
            </div>
          )}

          {voiceError && (
            <div className="mt-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {voiceError}
            </div>
          )}

          {inputWarning && (
            <div className="mt-2 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              {inputWarning}
            </div>
          )}

          {/* Input type badge — always visible */}
          <div className="mt-3 flex justify-between items-center">
            <div
              className={`px-3 py-1 text-sm rounded-full font-medium border transition-all duration-300 ${
                inputType === "Link"
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                  : inputType === "Phone"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  : "bg-white/10 text-white/60 border-white/20"
              }`}
            >
              {inputType === "Message" && "📝 Message Mode"}
              {inputType === "Link" && "🔗 Link Analysis Mode"}
              {inputType === "Phone" && "📞 Phone Check Mode"}
            </div>
          </div>

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

          <div className="flex gap-2 mt-4">
            {activeTab === "text" ? (
              <button
                id="analyze-btn"
                onClick={() => analyze()}
                disabled={loading || !message.trim()}
                className="flex-1 py-3 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-violet-500/20 active:scale-95"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span className="transition-all duration-300">{LOADING_STEPS[loadingStep]}</span>
                  </span>
                ) : (
                  "Analyze Message"
                )}
              </button>
            ) : (
              <button
                id="analyze-screenshot-btn"
                onClick={analyzeScreenshot}
                disabled={loading || !selectedImage}
                className="flex-1 py-3 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-violet-500/20 active:scale-95"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <span>{extractionStep === 0 ? "Extracting text..." : "Analyzing text..."}</span>
                  </span>
                ) : (
                  "🔍 Analyze Screenshot"
                )}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm mb-4">
            {error}
          </div>
        )}

        {/* ── AI Scanning Skeleton ── */}
        {loading && (
          <div className="border border-white/10 rounded-2xl p-5 sm:p-6 mb-4 bg-white/[0.03] backdrop-blur-sm">
            {/* Pulsing status row */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-sm text-violet-300/80 transition-all duration-300">
                {activeTab === "image" && !extractedText
                  ? (extractionStep === 0 ? "📸 Extracting text from image..." : "🤖 Analyzing extracted text...")
                  : LOADING_STEPS[loadingStep] + ` · ${platform}`}
              </span>
            </div>
            {/* Shimmer lines */}
            <div className="space-y-3">
              <div className="h-6 rounded-lg bg-white/5 animate-pulse w-1/3" />
              <div className="h-3 rounded-lg bg-white/5 animate-pulse w-full" />
              <div className="h-3 rounded-lg bg-white/5 animate-pulse w-5/6" />
              <div className="h-3 rounded-lg bg-white/5 animate-pulse w-4/6" />
              <div className="mt-4 h-2.5 rounded-full bg-white/5 animate-pulse w-full" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
              <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
              <div className="h-14 rounded-xl bg-white/5 animate-pulse" />
            </div>
          </div>
        )}

        {/* ── DETECTION TIMELINE ── */}
        {(loading || result) && (
          <div className="mb-4 px-1">
            <div className="flex items-start justify-between gap-0">
              {[
                "Message\nReceived",
                "Pattern\nDetected",
                "Risk\nEvaluated",
                "Advice\nGenerated",
              ].map((label, i) => {
                const done  = result ? true : i < timelineStep;
                const active = !result && i === timelineStep;
                return (
                  <div key={i} className="flex flex-col items-center flex-1">
                    {/* Connector row */}
                    <div className="flex items-center w-full">
                      {/* Left connector line */}
                      <div className={`flex-1 h-px ${i === 0 ? "bg-transparent" : done || active ? "bg-violet-500/60" : "bg-white/10"}`} />
                      {/* Step dot */}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border transition-all duration-500 ${
                          done
                            ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-400"
                            : active
                            ? "bg-violet-500/20 border-violet-400 text-violet-300 animate-pulse"
                            : "bg-white/[0.04] border-white/15 text-white/25"
                        }`}
                      >
                        {done ? "✓" : active ? "●" : "○"}
                      </div>
                      {/* Right connector line */}
                      <div className={`flex-1 h-px ${i === 3 ? "bg-transparent" : done ? "bg-violet-500/60" : "bg-white/10"}`} />
                    </div>
                    {/* Label */}
                    <p
                      className={`mt-1.5 text-[10px] text-center leading-tight transition-colors duration-300 whitespace-pre-line ${
                        done
                          ? "text-emerald-400/80"
                          : active
                          ? "text-violet-300"
                          : "text-white/25"
                      }`}
                    >
                      {label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Result Card + Trust Badge */}
        {result && cfg && (
          <div ref={resultRef}>
            {/* ── EXTRACTED TEXT COLLAPSIBLE ── */}
            {activeTab === "image" && extractedText && (
              <div className="mb-4 border border-white/10 rounded-xl overflow-hidden bg-white/5 backdrop-blur-sm">
                <button
                  onClick={() => setShowExtractedText(!showExtractedText)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-widest flex items-center gap-2">
                      <span className="text-sm">📝</span> Extracted Text
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">SUCCESS</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-white/30 transition-transform duration-300 ${
                      showExtractedText ? "rotate-180" : "rotate-0"
                    }`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ maxHeight: showExtractedText ? "300px" : "0px" }}
                >
                  <div className="px-4 pb-4">
                    <div className="bg-black/30 rounded-lg p-3 text-xs text-white/50 leading-relaxed font-mono whitespace-pre-wrap border border-white/5">
                      {extractedText}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TRUST BADGE ── */}
            {(() => {
              const TRUST_BADGE: Record<
                RiskLevel,
                { label: string; text: string; glow: string; ring: string }
              > = {
                Safe: {
                  label: "🔒 VERIFIED SAFE",
                  text: "text-emerald-300",
                  glow: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
                  ring: "bg-emerald-500/15 border-emerald-500/40",
                },
                Suspicious: {
                  label: "⚠️ UNTRUSTED MESSAGE",
                  text: "text-amber-300",
                  glow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
                  ring: "bg-amber-500/15 border-amber-500/40",
                },
                Scam: {
                  label: "🚨 HIGH RISK SCAM",
                  text: "text-rose-300",
                  glow: "shadow-[0_0_24px_rgba(239,68,68,0.40)]",
                  ring: "bg-rose-500/15 border-rose-500/40",
                },
              };
              const badge = TRUST_BADGE[result.risk];
              return (
                <div
                  className={`flex justify-center mb-3 transition-all duration-500 ${
                    resultVisible
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-90"
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full border font-bold text-sm tracking-widest uppercase ${badge.text} ${badge.ring} ${badge.glow}`}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })()}

            {simulateMode && result.risk !== "Safe" && (
              <div className="mb-4 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 animate-pulse text-sm font-medium flex items-center gap-2">
                <span>🚨</span>
                This message is actively trying to scam you. Do NOT click links or share personal information.
              </div>
            )}

            <div className={simulateMode ? "relative" : ""}>
              {simulateMode && result.risk !== "Safe" && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="bg-red-500/20 border border-red-500/40 px-4 py-2 rounded-full text-red-300 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    LIVE ATTACK SIMULATED
                  </div>
                </div>
              )}
              <div
                id="result-card"
                className={`relative border rounded-2xl p-5 sm:p-6 mb-4 backdrop-blur-sm ${cfg.bg} ${cfg.border} transition-all duration-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] ${
                  resultVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
              >
                {/* ── AI PROVIDER BADGE ── */}
                {aiProvider && (
                  <div className="absolute top-3 right-3">
                    {aiProvider === "anthropic" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-300 tracking-wide">
                        ⚡ Analyzed by Claude
                      </span>
                    )}
                    {aiProvider === "gemini" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 tracking-wide">
                        ⚡ Analyzed by Gemini
                      </span>
                    )}
                    {aiProvider === "fallback" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 border border-white/20 text-white/40 tracking-wide">
                        ⚡ Analyzed by Fallback
                      </span>
                    )}
                  </div>
                )}
            {/* Risk badge + confidence + score */}
            <div className="flex items-center justify-between mb-4">
              <div className={`flex items-center gap-2.5 ${cfg.color}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${cfg.bg} border ${cfg.border}`}>
                  {cfg.icon}
                </span>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-widest">Risk Level</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold">{cfg.label}</p>
                    {result.confidence && (
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[result.confidence]}`}>
                        {result.confidence}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-0.5">Scam Score</p>
                <p className={`text-3xl font-bold tabular-nums ${cfg.color}`}>{result.score}</p>
                <p className="text-xs text-white/30">/ 100</p>
              </div>
            </div>

            {/* ── EXPLAINABILITY TAGS ── */}
            {result.tags && result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {result.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${TAG_STYLES[tag] ?? "bg-white/10 border-white/20 text-white/60"}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Scam type chip */}
            {result.type && (
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  {result.type}
                </span>
              </div>
            )}

            {/* ── SCAM HEAT METER ── */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/40 uppercase tracking-widest">Scam Heat Meter</p>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    result.score <= 30
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : result.score <= 70
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {result.score <= 30 ? "Low Risk" : result.score <= 70 ? "Medium Risk" : "High Risk"}
                </span>
              </div>
              {/* Track */}
              <div className="relative h-3 bg-white/[0.06] rounded-full overflow-hidden">
                {/* Colour zone segments (decorative) */}
                <div className="absolute inset-0 flex">
                  <div className="w-[30%] h-full bg-emerald-500/10" />
                  <div className="w-[40%] h-full bg-amber-500/10" />
                  <div className="w-[30%] h-full bg-rose-500/10" />
                </div>
                {/* Animated fill */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${animatedScore}%`,
                    transition: "width 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
                    background:
                      result.score <= 30
                        ? "linear-gradient(90deg, #10b981, #34d399)"
                        : result.score <= 70
                        ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                        : "linear-gradient(90deg, #ef4444, #f87171)",
                    boxShadow:
                      result.score <= 30
                        ? "0 0 10px rgba(16,185,129,0.5)"
                        : result.score <= 70
                        ? "0 0 10px rgba(245,158,11,0.5)"
                        : "0 0 10px rgba(239,68,68,0.5)",
                  }}
                />
              </div>
              {/* Zone labels */}
              <div className="flex mt-1.5 text-[10px] text-white/20">
                <span className="w-[30%]">Low · 0–30</span>
                <span className="w-[40%] text-center">Medium · 31–70</span>
                <span className="w-[30%] text-right">High · 71–100</span>
              </div>
            </div>

            {/* ── PATTERN INDICATORS ── */}
            {result.patterns && (result.patterns.urgency || result.patterns.fear || result.patterns.reward) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 py-2.5 px-3 bg-white/[0.03] rounded-xl border border-white/8">
                {Object.entries(result.patterns)
                  .filter(([_, v]) => v)
                  .map(([k], i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-white/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60" />
                      <span className="text-white/70 capitalize">{k}</span>
                    </div>
                  ))}
              </div>
            )}

            {/* Reason */}
            <div className="mb-4">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1.5">Analysis</p>
              <p className="text-sm text-white/80 leading-relaxed">{result.reason}</p>
            </div>

            {/* ── SCAM STORY MODE ── */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 mb-4">
              <p className="text-xs text-violet-400/70 uppercase tracking-widest mb-2 font-semibold">
                🧠 What’s happening here?
              </p>
              <p className="text-sm text-white/70 leading-relaxed">
                {buildStoryNarrative(result)}
              </p>
            </div>

            {/* Triggers */}
            {result.triggers?.length > 0 && (
              <div className="mb-4">
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

            {/* ── URL SAFETY CHECKER ── */}
            {result.urls && result.urls.length > 0 && (
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-4">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-3 font-semibold">
                  🔗 Links Detected
                </p>
                <div className="space-y-2">
                  {result.urls.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-3 py-2"
                    >
                      <span className="text-xs text-white/60 truncate flex-1 font-mono">
                        {u.url}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${URL_VERDICT_STYLES[u.verdict]}`}
                      >
                        {u.verdict}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What To Do — advice */}
            {result.advice?.length > 0 && (
              <div className="bg-rose-950/40 border border-rose-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-rose-400/80 uppercase tracking-widest mb-3 font-semibold">What To Do</p>
                <ul className="space-y-2">
                  {result.advice.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/75">
                      <span className="mt-px shrink-0 text-base leading-none">⛔</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── WHY SCAMS WORK ── */}
            <div className="mb-4 border border-white/[0.08] rounded-xl overflow-hidden">
              <button
                onClick={() => setWhyOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-sm font-semibold text-white/70">
                  🎓 Why scams work?
                </span>
                <svg
                  className={`w-4 h-4 text-white/30 transition-transform duration-300 ${
                    whyOpen ? "rotate-180" : "rotate-0"
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                className="transition-all duration-300 ease-in-out overflow-hidden"
                style={{ maxHeight: whyOpen ? "200px" : "0px" }}
              >
                <ul className="px-4 pb-4 space-y-2.5">
                  {[
                    { icon: "⏰", title: "Urgency creates panic", desc: "Time pressure stops you from thinking clearly or verifying the source." },
                    { icon: "😨", title: "Fear reduces decision-making", desc: "Threats like 'your account will be locked' bypass rational thought." },
                    { icon: "🎁", title: "Rewards attract attention", desc: "Promises of prizes or money exploit natural human optimism." },
                  ].map(({ icon, title, desc }) => (
                    <li key={title} className="flex items-start gap-2.5">
                      <span className="text-base shrink-0 mt-px">{icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-white/70">{title}</p>
                        <p className="text-[11px] text-white/40 leading-relaxed">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── FAKE vs REAL COMPARISON ── */}
            {result.risk !== "Safe" && result.rewrite && (
              <div className="mb-4">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Message Comparison</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Original (fake) */}
                  <div className="bg-rose-950/50 border border-rose-500/25 rounded-xl p-4">
                    <p className="text-[11px] font-semibold text-rose-400/90 uppercase tracking-wider mb-2">⚠️ Original Message</p>
                    <p className="text-xs text-rose-100/70 leading-relaxed whitespace-pre-wrap break-words">{message}</p>
                  </div>
                  {/* Safe rewrite */}
                  <div className="bg-emerald-950/50 border border-emerald-500/25 rounded-xl p-4">
                    <p className="text-[11px] font-semibold text-emerald-400/90 uppercase tracking-wider mb-2">✅ Safe Version</p>
                    <p className="text-xs text-emerald-100/70 leading-relaxed whitespace-pre-wrap break-words">{result.rewrite}</p>
                  </div>
                </div>
              </div>
            )}

            {result && result.risk !== "Safe" && (
              <div className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 animate-pulse">
                <p className="text-xs">
                  ⏱ {result.consequence || getConsequence(result)}
                </p>
              </div>
            )}

            {result && result.risk !== "Safe" && (result.pressure || getPressureWarning(result)) && (
              <div className="mt-3 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <p className="text-xs">
                  ⚠️ {result.pressure || getPressureWarning(result)}
                </p>
              </div>
            )}

            {result && result.risk !== "Safe" && (
              <div className="mt-3 p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300">
                <p className="text-xs">
                  🧑‍🎓 {result.personaInsight || getPersonaInsight(result, persona)}
                </p>
              </div>
            )}
            
            {/* ── WHAT SHOULD YOU DO RIGHT NOW? ── */}
            {result && result.risk !== "Safe" && (
              <div className={`mt-5 p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300 ${panicOpen ? 'opacity-75' : 'hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]'}`}>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span>⚡</span> What Should You Do RIGHT NOW?
                </p>
                <p className="text-xs text-white/50 mb-3">
                  Immediate actions to stay safe
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setActionMsg("Action noted. Follow official steps to stay safe.");
                      setTimeout(() => setActionMsg(""), 2000);
                    }}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-rose-500/40 text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 transition-all text-[11px] font-semibold text-center"
                  >
                    <span className="text-base">🚫</span>
                    <span>Block Sender Immediately</span>
                  </button>
                  <button
                    onClick={() => {
                      setActionMsg("Action noted. Follow official steps to stay safe.");
                      window.open("https://cybercrime.gov.in", "_blank");
                      setTimeout(() => setActionMsg(""), 2000);
                    }}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-orange-500/40 text-orange-400 bg-orange-500/5 hover:bg-orange-500/15 transition-all text-[11px] font-semibold text-center"
                  >
                    <span className="text-base">📢</span>
                    <span>Report This Scam</span>
                  </button>
                  <button
                    onClick={() => {
                      setActionMsg("Action noted. Follow official steps to stay safe.");
                      setTimeout(() => setActionMsg(""), 2000);
                    }}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border border-white/20 text-white/50 bg-white/5 hover:bg-white/10 transition-all text-[11px] font-semibold text-center"
                  >
                    <span className="text-base">🔐</span>
                    <span>Secure Your Account</span>
                  </button>
                </div>
                {actionMsg && (
                  <p className="text-xs text-green-400 mt-2 animate-fadeIn text-center font-medium">
                    {actionMsg}
                  </p>
                )}

                {result && result.risk !== "Safe" && (
                  <button
                    onClick={() => setPanicOpen(!panicOpen)}
                    className="w-full mt-4 px-5 py-3 rounded-xl bg-red-500/20 
                               border border-red-500/50 text-red-300 font-semibold text-base
                               hover:bg-red-500/40 hover:scale-[1.02] hover:shadow-red-500/20 
                               hover:shadow-lg active:scale-[0.98] transition-all duration-200 
                               cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">🚨 I Already Clicked Something — Get Help Now</span>
                    <span className="text-sm">{panicOpen ? '▲' : '▼'}</span>
                  </button>
                )}

                {panicOpen && (
                  <div className="mt-3 p-4 rounded-2xl border-2 border-red-500 bg-red-500/10 text-red-200 shadow-lg shadow-red-500/20 animate-pulse transition-all duration-300 ease-out animate-slideUp">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                       🚨 Immediate Damage Control
                    </h3>
                    <ul className="text-xs space-y-2 list-disc pl-4 opacity-90 font-medium">
                      <li>Change your passwords immediately</li>
                      <li>Contact your bank or payment provider</li>
                      <li>Enable 2FA on all important accounts</li>
                      <li>Check recent transactions for suspicious activity</li>
                      <li>Do not click further links or respond</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={copyReport}
              className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              {copied ? "✓ Copied!" : "📋 Copy Report"}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              ⬇️ Download Report
            </button>
          </div>
          </div>
          </div>
          </div>
        )}

        {/* Scan History */}
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
                          {hcfg.label}
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

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0d0f] flex items-center justify-center">
        <div className="text-violet-400 animate-pulse font-mono tracking-widest text-sm">
          INITIALIZING SCAM DETECTOR...
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
