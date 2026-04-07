import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const FALLBACK = {
  risk: "Suspicious",
  score: 60,
  reason: "Temporary fallback (API unavailable)",
  triggers: ["fallback"],
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(FALLBACK);
    }
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `You are a scam detection AI. Analyze the message and return ONLY valid JSON, no markdown, no backticks.
Message: "${message}"
Return exactly:
{
  "risk": "Safe" or "Suspicious" or "Scam",
  "score": 0-100,
  "reason": "short explanation",
  "triggers": ["phrase1", "phrase2"]
}`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error("[analyze] error:", err instanceof Error ? err.message : err);
    return NextResponse.json(FALLBACK);
  }
}
