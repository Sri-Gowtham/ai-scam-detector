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
  "pattern": "Known Scam Template" | "Unique Pattern" | "Partial Match",
  "tags": ["<applicable tags from: Urgency, Financial Lure, Suspicious Link, Fear, Reward, Impersonation>"],
  "urls": [
    {
      "url": "<exact url extracted from the message>",
      "verdict": "Suspicious Domain" | "Not Official Domain" | "Safe"
    }
  ],
  "patterns": {
    "urgency": <true if message uses urgency tactics, false otherwise>,
    "fear": <true if message uses fear tactics, false otherwise>,
    "reward": <true if message promises rewards or prizes, false otherwise>
  }
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
- tags: detect ALL matching psychological/manipulation tags present in the message; return empty array if none apply
- urls: extract ALL URLs present in the message and assess whether each domain appears official or suspicious; return empty array if no URLs found
- urls.verdict: "Suspicious Domain" if the domain looks fake/malicious (e.g. bit.ly, random strings, misspelled brands), "Not Official Domain" if it's a real but non-official domain, "Safe" if it appears to be a legitimate official domain
- patterns.urgency: true if the message contains time pressure, deadlines, or urgent calls to action
- patterns.fear: true if the message threatens negative consequences, account suspension, legal action, etc.
- patterns.reward: true if the message offers prizes, money, gifts, or exclusive deals
- return ONLY the JSON object, nothing else`;
}

// ─── Parse AI response ────────────────────────────────────────────────────────

function parseJSON(raw: string) {
  // Strip markdown fences the model sometimes adds despite instructions
  const cleaned = raw.replace(/```json|```/g, "").trim();
  console.log("[analyze] raw AI response:", cleaned.slice(0, 300));
  const parsed = JSON.parse(cleaned); // throws on invalid JSON
  return parsed;
}

// Ensure the parsed object has the required dynamic fields
function validateParsed(obj: Record<string, unknown>) {
  const required = [
    "risk", "score", "type", "reason", "triggers", "advice",
    "confidence", "rewrite", "severity", "language", "pattern",
    "tags", "urls", "patterns",
  ];
  for (const key of required) {
    if (!(key in obj)) throw new Error(`AI response missing field: ${key}`);
  }
  if (typeof obj.score !== "number") throw new Error("score must be a number");
  return obj;
}

// ─── Smart keyword fallback ───────────────────────────────────────────────────

const SCAM_KEYWORDS = ["win", "won", "lottery", "click", "urgent", "prize", "claim", "free money", "otp", "verify now"];
const SUSPICIOUS_KEYWORDS = ["offer", "deal", "limited", "exclusive", "act now", "bank", "account", "password"];

function extractUrls(message: string): { url: string; verdict: "Suspicious Domain" | "Not Official Domain" | "Safe" }[] {
  const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
  const matches = message.match(urlRegex) || [];
  return matches.map((url) => {
    const lower = url.toLowerCase();
    const suspicious =
      lower.includes("bit.ly") ||
      lower.includes(".ru") ||
      lower.includes(".tk") ||
      lower.includes(".xyz") ||
      lower.includes(".top") ||
      /[a-z]{2,}-[a-z]{2,}-[a-z]{2,}/.test(lower) ||
      /secure-|login-|verify-|account-/.test(lower);
    return { url, verdict: suspicious ? "Suspicious Domain" : "Not Official Domain" };
  });
}

function smartMockResponse(message: string) {
  const lower = message.toLowerCase();

  const isScam = SCAM_KEYWORDS.some((kw) => lower.includes(kw));
  const isSuspicious = !isScam && SUSPICIOUS_KEYWORDS.some((kw) => lower.includes(kw));
  const urls = extractUrls(message);

  if (isScam) {
    const matchedTriggers = SCAM_KEYWORDS.filter((kw) => lower.includes(kw));
    const hasUrgency = ["urgent", "claim", "verify now"].some((kw) => lower.includes(kw));
    const hasReward = ["win", "won", "lottery", "prize", "free money"].some((kw) => lower.includes(kw));
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
      tags: [
        ...(hasUrgency ? ["Urgency"] : []),
        ...(hasReward ? ["Reward", "Financial Lure"] : []),
        ...(urls.length > 0 ? ["Suspicious Link"] : []),
      ],
      urls,
      patterns: {
        urgency: hasUrgency,
        fear: false,
        reward: hasReward,
      },
    };
  }

  if (isSuspicious) {
    const hasFear = ["account", "password", "bank"].some((kw) => lower.includes(kw));
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
      tags: [
        ...(hasFear ? ["Fear"] : []),
        ...(urls.length > 0 ? ["Suspicious Link"] : []),
      ],
      urls,
      patterns: {
        urgency: lower.includes("act now") || lower.includes("limited"),
        fear: hasFear,
        reward: lower.includes("offer") || lower.includes("deal"),
      },
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
    tags: [],
    urls,
    patterns: {
      urgency: false,
      fear: false,
      reward: false,
    },
  };
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function tryGemini(message: string, persona: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini key");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(buildPrompt(message, persona));
  const parsed = parseJSON(result.response.text());
  return validateParsed(parsed);
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
  const parsed = parseJSON(data.choices[0].message.content);
  return validateParsed(parsed);
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
