# AI Scam Detector Documentation

This document provides a technical overview of the AI Scam Detector project, detailing its implementation, architecture, and features based on the current codebase.

## 1. PROJECT SUMMARY
The **AI Scam Detector** is a specialized web application designed to identify and analyze potential scams in messages (SMS, WhatsApp, and Email). It leverages Google Gemini's multimodal capabilities to process both raw text and screenshots.

### Tech Stack
- **Framework**: Next.js (version 16.2.2, App Router)
- **UI Library**: React (version 19.2.4)
- **Styling**: Tailwind CSS (version 4)
- **Language**: TypeScript
- **AI Engine**: `@google/generative-ai` (Gemini 1.5 Flash & Gemini 2.0 Flash)
- **APIs**: Built-in Next.js Route Handlers

---

## 2. FEATURES (from `page.tsx`)

### UI Features
- **Dual-Tab Interface**: Switch between "Paste Text" for direct analysis and "Scan Screenshot" for image-based detection.
- **Voice-to-Text**: Integration with `webkitSpeechRecognition` for hands-free message input.
- **Interactive Scanning Animation**: A 4-stage detection timeline (Analyzing, Detecting Patterns, Checking Signals, Finalizing).
- **Scam Heat Meter**: An animated score bar (0-100) that visually represents risk levels.
- **Persona-Based Insights**: Tailored insights and advice for specific user groups (Student, Elderly, Employee, General).
- **Platform Specificity**: Context-aware analysis for SMS, WhatsApp, and Email.
- **Panic Panel**: An automated, high-urgency overlay that triggers immediately when a message is classified as a "Scam."
- **Scan History**: Persistent local storage of the last 10 scans with summary statistics.
- **Reporting System**: Options to copy a professional markdown report or download a text-based scam report.
- **URL Verdicts**: Individual safety rankings for links detected within the message.

### State Variables & Controls
- `message`: Stores the current text being analyzed.
- `selectedImage`: Stores the file object for screenshot uploads.
- `activeTab`: Controls the UI view (Text vs. Image).
- `persona`: Influences AI reasoning and tailored advice.
- `result`: The core `AnalysisResult` object containing AI output.
- `loading` / `loadingStep`: Manages the iterative scanning animation.
- `panicOpen`: Triggers the high-risk "Panic" dialog.
- `inputType`: Dynamically updates based on text content (Link, Phone, or Message).

### Key Frontend Functions
- `analyze(msg)`: Sends text to `/api/analyze`; updates UI with score and provider headers.
- `analyzeScreenshot()`: Sends image to `/api/extract`; handles OCR and subsequent analysis.
- `toggleListening()`: Starts/stops the browser's speech recognition engine.
- `copyReport()` / `handleDownload()`: Formats results into readable text/markdown for the user.
- `handleReset()`: Clears all states to start a fresh scan.

---

## 3. API ROUTES

### `/api/analyze`
- **Method**: `POST`
- **Request Body**: `{ message: string, persona: string, platform: string }`
- **Logic**: 
  - Uses `gemini-1.5-flash-latest`.
  - Implements a strict weighted scoring prompt (Base 10, with additives for urgency, impersonation, etc.).
  - **Fallback Chain**:
    1. AI Generation.
    2. Regex-based JSON extraction if the AI adds markdown backticks.
    3. Manual Keyword Fallback: If JSON parsing fails, it scans for "win", "lottery", "otp" etc., to return a baseline risk.
    4. `smartMockResponse`: A global catch-all mock if the entire process errors out.
- **Response Headers**: `X-AI-Provider` (e.g., `gemini-corrected`, `fallback-parse`, `global-fallback`).

### `/api/extract`
- **Method**: `POST`
- **Request Body**: `{ imageBase64: string, mimeType: string, persona: string }`
- **Logic**:
  - Uses `gemini-2.0-flash` for high-accuracy OCR.
  - **Extraction**: Requests only raw text from the provided screenshot.
  - **Post-Extraction**: Automatically passes the text to the `tryGemini` utility function in `lib/scam-logic.ts` for full analysis.
- **Response**: `{ extractedText: string, analysis: AnalysisResult }`

---

## 4. AI IMPLEMENTATION

### Models Used
- **Text Analysis**: `gemini-1.5-flash-latest` (Optimized for speed and structured JSON output).
- **OCR (Vision)**: `gemini-2.0-flash` (Utilized for superior character recognition in images).

### Prompt Logic
The AI is instructed with **Calibration Rules** and **Dynamic Scoring**:
- **Calibration**: Maps specific score ranges to "Safe" (0-30), "Suspicious" (31-69), and "Scam" (70-100).
- **Weighted Factors**: 
  - `+10`: Urgent language.
  - `+15`: Suspicious URL.
  - `+20`: Impersonation of institutions.
  - `+15`: Request for OTP/Security details.
- **Correction Layer (`lib/scam-logic.ts`)**: A hard-coded logic override that forces a "Scam" classification if high-threat keywords (e.g., "win", "suspended") are detected, even if the AI's raw JSON score was lower.

---

## 5. ENVIRONMENT VARIABLES
*Names only, as implemented in the code:*
- `GEMINI_API_KEY`

---

## 6. FOLDER STRUCTURE
```text
ai-scam-detector/
├── app/
│   ├── api/
│   │   ├── analyze/
│   │   │   └── route.ts        # Text analysis logic
│   │   └── extract/
│   │       └── route.ts        # OCR + Analysis logic
│   ├── layout.tsx
│   └── page.tsx                # Main UI (Text + Image tabs)
├── lib/
│   └── scam-logic.ts           # Shared types, prompt builders, and fallbacks
├── public/                     # Static assets
├── .env.local                  # API Keys (Local)
├── package.json                # Dependencies and commands
└── tsconfig.json               # Type configurations
```

---

## 7. HOW TO RUN
Based on `package.json` scripts:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
3.  **Build for Production**:
    ```bash
    npm run build
    ```
4.  **Start Production Server**:
    ```bash
    npm run start
    ```

---
*Documentation generated based on codebase audit as of 2026-04-09.*
