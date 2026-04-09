import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildPrompt, smartMockResponse } from "@/lib/scam-logic";

export async function POST(req: NextRequest) {
  let message = "";
  try {
    const body = await req.json();
    const { persona = "General", platform = "SMS" } = body;
    message = body.message;

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // Direct Gemini Call
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No Gemini key");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    // Call Gemini
    const prompt = `You are a highly calibrated scam detection AI.
Analyze this message and return ONLY raw JSON, no markdown, no backticks.

Message: "${message}"
Persona: "${persona || 'General'}"

CALIBRATION RULES — follow exactly:

Score 0-15 → risk: "Safe" → Examples: "hi", "see you tomorrow", "lunch at 3pm"
Score 16-30 → risk: "Safe" → Examples: "Your OTP is 4521", "Meeting confirmed"
Score 31-50 → risk: "Suspicious" → Examples: "You may have won", "Contact us for offer"
Score 51-69 → risk: "Suspicious" → Examples: "Verify your account", unknown sender requests
Score 70-85 → risk: "Scam" → Examples: "Click link to unblock account", fake prize claims
Score 86-100 → risk: "Scam" → Examples: bank impersonation + link + urgency combined

DYNAMIC SCORING — score based on these weighted factors:
+10 if contains urgent language (URGENT, immediately, blocked, suspended)
+15 if contains suspicious URL or non-official domain
+20 if impersonates bank, government, or known brand
+15 if requests OTP, password, Aadhaar, bank details
+10 if contains prize/reward/lottery claim
+10 if contains fear tactics (account blocked, legal action)
+5 if unknown sender pattern
-30 if message is casual conversation
-20 if message contains only OTP number with no link
-10 if message is from known official format

Start from base score 10, add/subtract factors above.
Final score MUST reflect actual message content — never default to 60.

Return exactly:
{
  "risk": "Safe" or "Suspicious" or "Scam",
  "score": <calculated 0-100>,
  "type": "Phishing" or "Lottery" or "OTP Fraud" or "Job Scam" or "Unknown",
  "reason": "specific 1-2 sentence explanation referencing exact message content",
  "triggers": ["exact phrases from message"],
  "advice": ["specific step 1", "step 2", "step 3"],
  "confidence": "Low" or "Medium" or "High",
  "rewrite": "safe version or empty string if Safe",
  "severity": {
    "factors": ["specific factor from this message"],
    "breakdown": "exact calculation explanation"
  },
  "language": "English" or "Tamil" or "Hindi" or "Mixed" or "Unknown",
  "pattern": "Known Scam Template" or "Unique Pattern" or "Partial Match",
  "tags": ["Urgency", "Financial Lure", "Suspicious Link", "Fear", "Reward", "Impersonation"],
  "urls": [{"url": "url", "verdict": "Suspicious Domain" or "Not Official Domain" or "Safe"}],
  "patterns": {"urgency": true or false, "fear": true or false, "reward": true or false}
}`;

    const aiResult = await model.generateContent(prompt);
    const text = aiResult.response.text();

    // 1) LOG RAW AI RESPONSE (VERY IMPORTANT)
    console.log("RAW AI RESPONSE:", text)

    // 2) SAFE JSON PARSE (FIX BREAKAGE)
    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      if (parsed) {
        parsed.consequence ||= "";
        parsed.pressure ||= "";
        parsed.personaInsight ||= "";
      }
    } catch (e) {
      console.log("PARSE ERROR:", e)
      parsed = null
    }

    // 3) HARD FALLBACK IF PARSE FAILS
    if (!parsed) {
      console.log("USING FALLBACK")
      const lower = message.toLowerCase()

      if (/(win|lottery|prize|click|urgent|otp|verify|account|bank)/i.test(lower)) {
        return NextResponse.json({
          risk: "Scam",
          score: 80,
          type: "Phishing",
          reason: "Detected scam keywords",
          triggers: ["urgent", "click"],
          tags: ["Urgency"],
          patterns: { urgency: true, fear: false, reward: true },
          confidence: "Medium",
          advice: ["Do not interact"],
          rewrite: "Ignore this message"
        }, {
          headers: { "X-AI-Provider": "fallback-parse" },
        })
      }

      return NextResponse.json({
        risk: "Safe",
        score: 20,
        type: "Unknown",
        reason: "No scam indicators",
        triggers: [],
        tags: [],
        patterns: { urgency: false, fear: false, reward: false },
        confidence: "High",
        advice: ["No action needed"],
        rewrite: message
      }, {
        headers: { "X-AI-Provider": "fallback-safe" },
      })
    }

    // 4) FORCE CORRECT RISK (ANTI-BIAS FIX)
    const lower = message.toLowerCase()

    if (/(win|lottery|prize|free money)/i.test(lower)) {
      parsed.risk = "Scam"
      parsed.score = 85
    }
    else if (/(click|link|verify|account|otp|bank|urgent)/i.test(lower)) {
      if (parsed.risk === "Safe") {
        parsed.risk = "Suspicious"
        parsed.score = 60
      }
    }

    // 5) FINAL LOG
    console.log("FINAL OUTPUT:", parsed)

    // 6) RETURN
    return NextResponse.json(parsed, {
      headers: { "X-AI-Provider": "gemini-corrected" },
    });

  } catch (error: any) {
    console.error("[analyze] Global Error:", error.message || error);
    if (error.stack) console.error(error.stack);
    
    const fallback = smartMockResponse(message);
    return NextResponse.json(fallback, {
      headers: { "X-AI-Provider": "global-fallback" },
    });
  }
}