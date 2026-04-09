# 🛡️ AI Scam Detector

> Real-time AI-powered scam detection for SMS, WhatsApp, and Email messages — built at BuildWithAI INNOVATEX 4.0 Hackathon.

---

## 🚨 Problem

- Millions of scam messages are sent daily targeting students, elderly, and employees
- Existing solutions are reactive — people realize too late
- No real-time, intelligent, explainable scam detection tool exists for common users

---

## ✅ Solution

AI Scam Detector analyzes any message instantly and tells you:
- Is it Safe, Suspicious, or a Scam?
- What type of scam is it?
- What should you do right now?

---

## 🔥 Features

- 🔍 **Real-time Text Analysis** — paste any SMS, WhatsApp, or email
- 📸 **Screenshot Scanner** — upload image, AI extracts + analyzes text
- 🎙️ **Voice Input** — speak your message, AI transcribes + detects
- 📊 **Risk Score (0-100)** — dynamic calibrated scoring
- 🏷️ **Scam Type Detection** — Phishing, Lottery, OTP Fraud, Job Scam
- ⚡ **Explainability Tags** — Urgency, Fear, Financial Lure, Impersonation
- 🔗 **URL Safety Checker** — flags suspicious domains
- 🧑 **Persona Mode** — tailored advice for Student, Elderly, Employee
- 🚨 **Panic Button** — immediate damage control if already clicked
- 📋 **Copy + Download Report** — export full analysis
- 🕐 **Scan History** — last 10 scans saved locally
- 🤖 **Multi-AI Architecture** — Claude (primary) + Gemini (fallback)

---

## 🧠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, Tailwind CSS |
| Backend | Next.js API Routes |
| AI (Primary) | Anthropic Claude (claude-haiku) |
| AI (Fallback) | Google Gemini 1.5 Flash |
| OCR | Gemini Vision + HuggingFace |
| Deployment | Vercel |

---

## 🏗️ Architecture