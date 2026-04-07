import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(message: string, persona: string) {
  const personaContext =
    persona !== "General"
      ? `\nThe recipient persona is: ${persona}. Tailor your advice to be especially relevant for a ${persona.toLowerCase()} audience.`
      : "";

  return `You are an expert scam detection AI. Analyze the following message and return ONLY raw JSON — no markdown, no backticks, no explanation.${personaContext}

Message: "${message}"

Return exactly this JSON structure:
{
  "risk": "Safe" | "Suspicious" | "Scam",
  "score": <integer 0-100>,
  "type": "Phishing" | "Lottery" | "OTP Fraud" | "Job Scam" | "Unknown",
  "reason": "<1-2 sentence explanation specific to THIS message, not generic>",
  "triggers": ["<exact phrase copied verbatim from the message that is suspicious>"],
  "advice": ["<actionable step 1 specific to the detected scam type>", "<actionable step 2>", "<actionable step 3>"],
  "confidence": "Low" | "Medium" | "High",
  "rewrite": "<if the message is suspicious or a scam, rewrite it as a safe, legitimate version; if safe, return empty string>",
  "severity": {
    "factors": ["<factor 1 contributing to score>", "<factor 2>", "<factor 3>"],
    "breakdown": "<1 sentence explaining why this specific score was assigned>"
  },
  "language": "English" | "Tamil" | "Hindi" | "Mixed" | "Unknown",
  "pattern": "Known Scam Template" | "Unique Pattern" | "Partial Match"
}

Scoring rules:
- 0–30   → risk must be "Safe"
- 31–69  → risk must be "Suspicious"
- 70–100 → risk must be "Scam"

Critical rules:
- reason must reference specific content from the message, never be generic
- triggers must contain EXACT phrases lifted verbatim from the input message (empty array if Safe)
- advice must be tailored to the detected scam type AND the persona (e.g. Elderly advice is simpler and more cautious)
- rewrite must be empty string "" when risk is "Safe"
- severity.factors must list exactly 3 specific factors that influenced the score
- severity.breakdown must be a single sentence explaining the score, referencing the message content
- language must detect the actual language of the input message
- pattern: use "Known Scam Template" if it closely matches common scam formats, "Partial Match" if it shares some traits, "Unique Pattern" if it does not match known templates
- return ONLY the JSON object, nothing else`;
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function parseJSON(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── Smart keyword fallback ───────────────────────────────────────────────────

const SCAM_KEYWORDS = ["win", "won", "lottery", "click", "urgent", "prize", "claim", "free money", "otp", "verify now"];
const SUSPICIOUS_KEYWORDS = ["offer", "deal", "limited", "exclusive", "act now", "bank", "account", "password"];

function smartMockResponse(message: string) {
  const lower = message.toLowerCase();

  const isScam = SCAM_KEYWORDS.some((kw) => lower.includes(kw));
  const isSuspicious = !isScam && SUSPICIOUS_KEYWORDS.some((kw) => lower.includes(kw));

  if (isScam) {
    const matchedTriggers = SCAM_KEYWORDS.filter((kw) => lower.includes(kw));
    return {
      risk: "Scam",
      score: 85,
      type: lower.includes("lottery") || lower.includes("win") ? "Lottery" : "Phishing",
      reason: "The message contains high-risk keywords commonly associated with scam attempts.",
      triggers: matchedTriggers,
      advice: [
        "Do not click any links in this message",
        "Do not share personal or financial information",
        "Report this message to your provider",
      ],
      confidence: "Medium",
      rewrite: "",
      severity: {
        factors: ["Urgency language", "Prize/reward lure", "Request for action"],
        breakdown: "High score assigned due to presence of known scam trigger words.",
      },
      language: "Unknown",
      pattern: "Known Scam Template",
    };
  }

  if (isSuspicious) {
    return {
      risk: "Suspicious",
      score: 55,
      type: "Unknown",
      reason: "The message contains some terms that are commonly found in suspicious communications.",
      triggers: SUSPICIOUS_KEYWORDS.filter((kw) => lower.includes(kw)),
      advice: [
        "Verify the sender's identity before responding",
        "Do not share sensitive information",
        "Contact the organization directly through official channels",
      ],
      confidence: "Low",
      rewrite: "",
      severity: {
        factors: ["Unverified sender", "Potentially deceptive language", "Unusual request"],
        breakdown: "Moderate score due to presence of terms common in suspicious messages.",
      },
      language: "Unknown",
      pattern: "Partial Match",
    };
  }

  return {
    risk: "Safe",
    score: 15,
    type: "Unknown",
    reason: "No suspicious patterns or high-risk keywords were detected in this message.",
    triggers: [],
    advice: [
      "Continue practicing safe messaging habits",
      "Stay alert for unexpected requests",
      "When in doubt, verify sender identity",
    ],
    confidence: "Low",
    rewrite: "",
    severity: {
      factors: ["No urgency language", "No suspicious links", "No reward lures"],
      breakdown: "Low score assigned as no known scam indicators were found.",
    },
    language: "Unknown",
    pattern: "Unique Pattern",
  };
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function tryGemini(message: string, persona: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini key");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(buildPrompt(message, persona));
  return parseJSON(result.response.text());
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function tryOpenAI(message: string, persona: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI key");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: buildPrompt(message, persona) }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return parseJSON(data.choices[0].message.content);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { message, persona = "General" } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  // 1️⃣ Gemini (primary)
  try {
    const result = await tryGemini(message, persona);
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[analyze] Gemini failed:", err instanceof Error ? err.message : err);
  }

  // 2️⃣ OpenAI (secondary)
  try {
    const result = await tryOpenAI(message, persona);
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[analyze] OpenAI failed:", err instanceof Error ? err.message : err);
  }

  // 3️⃣ Keyword-based mock (last resort)
  console.warn("[analyze] All APIs failed — using smart mock fallback");
  return NextResponse.json(smartMockResponse(message));
}
