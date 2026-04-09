import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { tryGemini, smartMockResponse } from "@/lib/scam-logic";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, persona = "General" } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Basic size check (approx 4MB limit for standard Next.js API bodies)
    if (imageBase64.length > 6 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large, please use a smaller screenshot" }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No Gemini key");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // 1. Extract text from image using Gemini Vision
    try {
      const prompt = "Extract all text from this screenshot exactly as written. Return ONLY the extracted text, nothing else.";
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64.split(",")[1] || imageBase64,
            mimeType: mimeType || "image/png",
          },
        },
      ]);

      const extractedText = result.response.text().trim();

      if (!extractedText || extractedText.length < 5) {
        return NextResponse.json({ error: "No clear text found in image" }, { status: 422 });
      }

      // 2. Analyze the extracted text for scams
      let analysis;
      try {
        analysis = await tryGemini(extractedText, persona as any);
      } catch (err) {
        console.warn("[extract] AI Analysis failed, using mock:", err);
        analysis = smartMockResponse(extractedText);
      }

      return NextResponse.json({
        extractedText,
        analysis,
      });

    } catch (apiErr: any) {
      console.error("[extract] Gemini API error:", apiErr);
      return NextResponse.json({ error: "AI extraction failed. Please try a clearer screenshot." }, { status: 502 });
    }

  } catch (err) {
    console.error("[extract] Global error:", err);
    return NextResponse.json({ error: "Something went wrong during processing" }, { status: 500 });
  }
}
