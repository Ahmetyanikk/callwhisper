# CallWhisper — Trial Task SOW

**Source:** `CallWhisper_Trial_Task_SOW_final_version.pdf` (Optimum7, April 2026)

> This is a plain-markdown copy of the official Scope of Work document for reference inside the repo. The signed PDF is the authoritative version. If there's ever a conflict between this file and the PDF, the PDF wins.

---

## Project metadata

| Field        | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| Company      | Optimum7 / Zen Media                                                 |
| Project      | CallWhisper — Real-Time AI Sales Coaching Engine                     |
| Role         | AI Engineer (Trial Task)                                             |
| Duration     | 48 hours from task kickoff                                           |
| Start Date   | To be confirmed at kickoff                                           |
| Reports To   | Serhat Durum — serhat@optimum7.com                                   |
| Build Tool   | AI-assisted development encouraged (Claude Code, Cursor, Copilot)    |
| Date         | April 2026                                                           |

---

## 1. What we're building

CallWhisper is a real-time AI sales coaching tool for Optimum7 and Zen Media sales teams. During a live Zoom call, it captures audio from both the sales rep (mic) and the prospect (Zoom audio), transcribes both streams with high accuracy and low latency, and feeds the live transcript into an AI engine that delivers real-time coaching suggestions to the rep.

The trial task is to build a working prototype of this core loop: **capture → transcribe → coach**.

---

## 2. The task

Build a working prototype that does three things:

| Component          | What it does                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audio Capture      | Capture two separate audio streams during a Zoom call: (1) the rep's microphone input, and (2) the system/desktop audio from the Zoom call (other participants). Both streams must be captured simultaneously.                                                                 |
| Live Transcription | Transcribe both audio streams in real time using a streaming transcription API (Deepgram recommended). The transcript must clearly label who is speaking (Rep vs Prospect). Target: sub-2-second latency, high accuracy.                                                       |
| AI Live Coaching   | Feed the live transcript into Claude API and generate real-time coaching suggestions: what to say next, objection responses, qualification questions, closing prompts. Suggestions must appear within 3 seconds of the relevant conversation moment.                            |

---

## 3. Technical requirements

### 3.1 Audio Capture

- Must capture mic audio (rep) and system/desktop audio (prospect on Zoom) as two separate streams.
- Both streams captured simultaneously during a live Zoom call.
- Primary platform: macOS.

**Approach options** — pick whichever you can ship fastest with highest reliability:

- Swift/macOS native app using Core Audio + system audio capture.
- Web-based app using browser APIs + virtual audio routing (BlackHole, Loopback, etc.).
- Chrome extension that captures tab audio from the Zoom web client.

### 3.2 Live Transcription

- Streaming transcription via WebSocket (Deepgram Streaming API recommended).
- Two parallel transcription streams — one per audio source.
- Speaker labeling: each transcript segment tagged as "Rep" or "Prospect".
- Latency target: partial transcripts appearing within 2 seconds of speech.
- Must handle natural conversation, interruptions, and cross-talk reasonably.
- Reconnection handling if WebSocket drops.

### 3.3 AI Coaching Engine

- Takes the rolling transcript (last 60–90 seconds of context) and sends to Claude API.
- AI generates short, actionable coaching suggestions:
  - **"Say this"** — a suggested phrase or response.
  - **"Ask this"** — a follow-up question.
  - **"Watch out"** — a flag (competitor mention, budget concern, stall signal).
- Suggestions refresh as the conversation progresses — not a one-time output.
- Throttling: max 1 suggestion update every 5–10 seconds unless a critical moment is detected.
- Prompt tuned for sales coaching context (not generic summarization).

### 3.4 UI

- Simple, functional — this is not a design exercise.
- Left panel: live transcript with speaker labels and timestamps.
- Right panel: AI coaching suggestions (most recent on top).
- Start/Stop session button.
- Native macOS window (Swift/SwiftUI) or a web page — your choice.

---

## 4. Deliverables

- Working prototype demoed on a real or simulated Zoom call.
- Source code in a private GitHub repo. Share access with GitHub user `@serhatoptimum7` (or alternate handle confirmed at kickoff).
- README with setup instructions, architecture decisions, and known limitations.
- Short video demo (3–5 min) showing the tool working on a test call.
- If using AI-assisted development tools (Claude Code, Cursor, etc.), share session logs or screen recordings of the build process.

---

## 5. Constraints

| Constraint      | Details                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline        | 48 hours from task kickoff. Bias toward shipping something that works over polishing something incomplete.                                      |
| Working Style   | Async work — no required check-ins or standups. Deliver the working prototype within the 48-hour window.                                        |
| Build Tool      | Use whatever you want — Claude Code, Cursor, Copilot, vanilla IDE. If you use AI-assisted tools, share session logs or a short screen recording.|
| Platform        | macOS — Zoom desktop or Zoom web client. No need for Windows or Linux support.                                                                   |
| Transcription   | Deepgram preferred. AssemblyAI or Whisper streaming acceptable if justified in the README.                                                       |
| LLM             | Claude API preferred. OpenAI acceptable.                                                                                                         |
| API Keys & Costs| The candidate is responsible for obtaining their own API keys (Deepgram, Anthropic, etc.) and covering any API usage costs during the trial.    |

---

## 6. How we evaluate

> We're not looking for perfect code. We're looking for someone who can figure things out fast, architect cleanly, and ship something that works.

| Criteria                        | What we're looking for                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Does it work?                   | Can we start a Zoom call and see live transcript + AI coaching suggestions in real time?                                 |
| Audio capture quality           | Are both streams (mic + system audio) captured cleanly and separately? Is speaker labeling accurate?                     |
| Transcription accuracy & speed  | Is it accurate? Is it fast? Does it handle real conversation, interruptions, and overlapping speech?                     |
| AI coaching relevance           | Are the suggestions actually useful for a salesperson, or generic filler?                                                |
| AI tooling & workflow           | How do you use AI tools in your workflow? We value candidates who can leverage AI-assisted development effectively.      |
| Architecture                    | Is the code structured so we can extend it? Clean separation between capture, transcription, and AI layers.              |
| Speed of delivery               | Did you ship within 48 hours? Bias toward action over perfection.                                                        |

### Minimum bar to pass the trial

- Two audio streams (rep + prospect) captured separately during a live Zoom call.
- Live transcript with correct speaker labels and sub-2-second partial latency.
- At least one coaching suggestion category (Say this / Ask this / Watch out) generated in real time from the live transcript.
- Working demo on a real or simulated Zoom call, delivered within the 48-hour window.

---

## 7. What happens next

If the trial goes well — meaning the minimum bar above is met and the evaluation criteria are broadly satisfied — the candidate moves into the full CallWhisper build as the AI Engineer. The full project includes:

- Objection classification system (price, timing, authority, competitor, etc.).
- RAG-powered knowledge base with Optimum7 / Zen Media sales intelligence.
- Post-call scoring and performance analysis.
- Pre-call prospect research automation.
- Multi-agent orchestration using the Claude Agents SDK.
- Admin tools for managing sales playbooks.

This trial task is the foundation. Everything else builds on top of it.

---

## 8. Confidentiality & IP

- An NDA must be signed before the trial kickoff. No access to internal sales data, call recordings, or infrastructure is granted until the NDA is in place.
- All work product created during the trial is the exclusive property of Optimum7 / Zen Media, as formalized in the contractor agreement signed prior to kickoff.
- CallWhisper is for internal use only — it must not be discussed externally, open-sourced, or used as portfolio material without prior written permission from Optimum7.
- Development logs or screen recordings produced during the trial may be reviewed by Optimum7 as part of the evaluation.

---

## Signatures (on the source PDF)

- Optimum7 Representative: ________________________________ Date: __________________
- Candidate: ________________________________ Date: __________________

---

## Notes for this repo (not part of the SOW)

- This file is kept in the repo so Claude Code can reference it during every session. See `CLAUDE.md` § "Session protocol".
- Platform deviation: candidate is developing on Windows 11 + VB-Cable (Windows equivalent of BlackHole). This deviation from SOW § 5 "Platform" was communicated to Serhat before kickoff; macOS port is a ~30-minute swap documented in the README. **Only leave this note in if Serhat has confirmed the Windows path — otherwise delete it.**
