import { GoogleGenerativeAI } from "@google/generative-ai";

export type RiskLevel = "Safe" | "Suspicious" | "Scam";
export type ScamType = "Phishing" | "Lottery" | "OTP Fraud" | "Job Scam" | "Delivery Scam" | "Unknown";
export type Confidence = "Low" | "Medium" | "High";
export type Persona = "General" | "Student" | "Elderly" | "Employee";
export type UrlVerdict = "Suspicious Domain" | "Not Official Domain" | "Safe";

export interface DetectedUrl {
  url: string;
  verdict: UrlVerdict;
}

export interface AnalysisResult {
  risk: RiskLevel;
  score: number;
  type: ScamType;
  reason: string;
  triggers: string[];
  tags: string[];
  patterns: { urgency: boolean; fear: boolean; reward: boolean };
  confidence: Confidence;
  advice: string[];
  rewrite: string;
  urls?: DetectedUrl[];
  severity?: { factors: string[]; breakdown: string };
  language?: string;
  pattern?: string;
  consequence?: string;
  pressure?: string;
  personaInsight?: string;
}

export function buildPrompt(message: string, persona: Persona = "General", platform: string = "SMS") {
  return `
Analyze the following message received via ${platform}. 
The recipient persona is: ${persona}. Adjust the reasoning and advice to be specific to this persona.

Return STRICT JSON:

{
  "risk": "Safe" | "Suspicious" | "Scam",
  "score": number (0-100),
  "type": "Phishing" | "Lottery" | "OTP Fraud" | "Job Scam" | "Delivery Scam" | "Unknown",
  "reason": string,
  "triggers": string[],
  "tags": string[],
  "patterns": string[],
  "confidence": "Low" | "Medium" | "High",
  "advice": string[],
  "rewrite": string,
  "urls": [{ "url": string, "verdict": "Suspicious Domain" | "Not Official Domain" | "Safe" }],
  "consequence": string,
  "pressure": string,
  "personaInsight": string
}

RULES:
- "Scam" → ONLY if clear malicious intent (fake links, money demand, impersonation)
- "Suspicious" → some warning signs but not fully confirmed
- "Safe" → normal conversation, no scam indicators

IMPORTANT:
- DO NOT default to "Suspicious"
- Use "Safe" if no strong indicators
- Vary results realistically
- If URLs are present, analyze them carefully.

SCORING:
- Safe → 0–40
- Suspicious → 40–70
- Scam → 70–95

ANALYSIS FACTORS:
- urgency words (urgent, now, immediately)
- financial bait (win, prize, reward)
- impersonation (bank, police, company)
- links/domains
- request for OTP/password
- URLs or phone numbers that don't match the claimed identity

NEW FIELDS INSTRUCTIONS:
- consequence: explain real-world damage in a short, impactful way (Max 12 words). E.g., "This can drain your bank account within minutes"
- pressure: identify psychological tactic like urgency, fear, reward (Max 12 words or "" if none). E.g., "This message creates urgency to rush your decision"
- personaInsight: tailor impact based on the persona (${persona}) (Max 12 words or "" if none). E.g., "Students are often targeted with fake job offers"

Return ONLY JSON. No extra text. Do NOT repeat the "reason" in these fields. Make it human, urgent, and simple.

Message:
"${message}"
`;
}

export function validateParsed(parsed: any): AnalysisResult {
  if (!parsed || !parsed.risk || !parsed.reason) {
    throw new Error("Invalid AI response");
  }
  return parsed as AnalysisResult;
}

export function smartMockResponse(message: string): AnalysisResult {
  const text = message.toLowerCase();

  if (/(win|lottery|prize|click|urgent|verify|account|otp)/.test(text)) {
    return {
      risk: "Scam",
      score: 80,
      type: "Phishing",
      reason: "Contains strong scam indicators like urgency or financial bait",
      triggers: ["urgent", "click", "verify"],
      tags: ["Urgency", "Financial Lure"],
      patterns: { urgency: true, fear: false, reward: true },
      confidence: "Medium",
      advice: ["Do not click links", "Do not share personal info"],
      rewrite: "Ignore this message. Contact official source directly.",
    };
  }

  return {
    risk: "Safe",
    score: 20,
    type: "Unknown",
    reason: "No scam indicators detected",
    triggers: [],
    tags: [],
    patterns: { urgency: false, fear: false, reward: false },
    confidence: "High",
    advice: ["No action needed"],
    rewrite: message,
  };
}

export async function tryGemini(
  message: string, 
  persona: Persona = "General", 
  platform: string = "SMS"
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini key");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  // Using gemini-1.5-flash-latest for standard analysis
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  
  const result = await model.generateContent(buildPrompt(message, persona, platform));
  const raw = result.response.text();
  
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  let parsed = JSON.parse(cleaned);
  
  parsed = validateParsed(parsed);
  
  // ── HARD RULE OVERRIDE (Correction Layer) ──
  const text = message.toLowerCase();

  if (
    /(win|lottery|prize|free money|click here|verify account|urgent|otp|password|bank|suspended|limited time)/i.test(text)
  ) {
    // Force Scam for high-threat keywords
    parsed.risk = "Scam";
    parsed.score = Math.max(parsed.score || 70, 75);
  } else if (
    /(link|http|www|offer|reward|account|login)/i.test(text)
  ) {
    // Upgrade to Suspicious if links or lures are present but AI missed them
    if (parsed.risk === "Safe") {
      parsed.risk = "Suspicious";
      parsed.score = Math.max(parsed.score || 50, 50);
    }
  } else {
    // Balance rule: clear low-threat messages
    if (!parsed.risk || parsed.risk === "Suspicious") {
      parsed.risk = "Safe";
      parsed.score = Math.min(parsed.score || 30, 35);
    }
  }

  // Apply light score variation and final clamp
  parsed.score = Math.max(0, Math.min(100, (parsed.score || 0) + Math.floor(Math.random() * 5)));
  
  return parsed as AnalysisResult;
}
