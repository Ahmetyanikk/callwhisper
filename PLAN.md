# PLAN.md

**Living tracker for the 48-hour CallWhisper trial. Update after every session.**

Read `CLAUDE.md` first for conventions and scope rules. This file tells you *what* to do next; `CLAUDE.md` tells you *how* to do it.

---

## Current status

- **Clock:** started Thu Apr 30, 14:00 Istanbul time
- **Hour:** ~18.5 of 48
- **Current session:** Session 7 complete, Session 8 next (README + handoff email)
- **Minimum bar status:** ✅ audio · ✅ transcript · ✅ coaching · ✅ DEMO VIDEO
- **All four SOW minimum-bar items met. Remaining work is documentation + delivery.**
- **Blocker:** none

Update the three lines above at the start and end of every session.

---

## The minimum bar (SOW section 6)

Everything below exists to hit these four things. If we're behind, we cut features, not the bar.

1. Two audio streams (rep + prospect) captured separately during a live Zoom call.
2. Live transcript with correct speaker labels and sub-2-second partial latency.
3. At least one coaching suggestion category (Say this / Ask this / Watch out) generated in real time.
4. Working demo on a real or simulated Zoom call, delivered within 48 hours.

---

## 48-hour breakdown

Each session has a **goal**, an **exit criterion** (how you know it's done), and a **target duration**. If a session runs past 1.5× its target, stop and reassess — don't push through.

Session 0 — Windows pre-kickoff setup (1 hour, before clock starts)

- [ ] Email Serhat re: Windows dev environment, wait for reply
- [ ] Download + install VB-Cable from vb-audio.com/Cable
- [ ] Download + install Voicemeeter Banana from vb-audio.com/Voicemeeter
- [ ] Restart Windows (VB-Cable requires it)
- [ ] Configure Voicemeeter: route CABLE Output → your speakers (so you can hear)
- [ ] In Zoom → Settings → Audio → Speaker: select "CABLE Input"
- [ ] Open a YouTube video in Zoom's test mode or a test call
  - [ ] Confirm you can hear it (Voicemeeter routing works)
  - [ ] Open browser, run the test-capture.html page
  - [ ] Select "CABLE Output" as prospect input → waveform should react
  - [ ] Select your mic as rep input → waveform reacts when you speak
- [ ] Get Deepgram API key, test with curl
- [ ] Get Anthropic API key, test with a Python hello-world
- [ ] Python 3.11+ installed, venv works, empty FastAPI boots
- [ ] Start screen recorder (OBS Studio is the Windows equivalent of QuickTime)

**Exit criterion:** Both waveforms move in the test page, both API keys return valid responses, empty FastAPI boots.

**If audio capture fails:** pivot to a Chrome extension using `chrome.tabCapture` on Zoom web client. Do NOT proceed to Session 1 until you have *some* working audio capture path.

---

### Session 1 — Scaffolding (hours 0–2)
**Target:** 1–2 hours
**Goal:** Boot an empty project skeleton, both ends running.
**Tasks:**
- [ ] Create file layout from `CLAUDE.md`
- [ ] `requirements.txt` (fastapi, uvicorn, websockets, anthropic, python-dotenv, pydantic)
- [ ] `.env.example`, `.gitignore`, `pyproject.toml` (optional)
- [ ] `server/main.py` — FastAPI app with `GET /health` returning `{"status": "ok"}` and a WebSocket endpoint at `/ws` that just echoes for now
- [ ] `client/index.html` + `client/app.js` — two empty panels, "Start Session" button, logs "ready" on load
- [ ] `mypy server/` passes
- [ ] Commit: `chore: initial scaffolding`

**Exit criterion:** `uvicorn` runs, frontend loads, clicking "Start Session" connects to the WS and logs a successful handshake.

---

### Session 2 — Audio capture end-to-end (hours 2–6)
**Target:** 3–4 hours. **This is the highest-risk session.**
**Goal:** Browser captures both streams, pushes PCM frames to backend, backend logs that it received them tagged correctly.
**Tasks:**
- [ ] `client/app.js` — dual `getUserMedia`, AudioWorklet for 16kHz PCM downsampling (port from scaffolded `audio.ts`)
- [ ] Binary framing: 1 byte channel tag (0x01 = rep, 0x02 = prospect) + PCM16 payload
- [ ] Device picker UI — auto-select BlackHole if present
- [ ] `server/main.py` WebSocket handler — parses binary frames, routes by tag, logs `[REP] 3200 bytes` / `[PROSPECT] 3200 bytes`
- [ ] Commit: `feat: dual audio capture with PCM streaming`

**Exit criterion:** Speak into mic → backend logs `[REP]` frames. Play YouTube → backend logs `[PROSPECT]` frames. Both can happen simultaneously.

**Common traps:**
- BlackHole shows up but returns silence → check System Settings → Sound → Output is set to the Multi-Output Device
- AudioWorklet fails to load → serve the page over HTTP, not `file://`
- Sample rate mismatch → log `audioContext.sampleRate` on the client; the downsampler has to handle whatever the device hands you

---

### Session 3 — Deepgram integration (hours 6–10)
**Target:** 3–4 hours
**Goal:** Both audio channels produce transcripts with speaker labels, streamed back to the browser.
**Tasks:**
- [ ] `server/deepgram_client.py` — port the TypeScript scaffold to Python with `asyncio` + `websockets`
- [ ] Two `DeepgramStream` instances per session, one per channel
- [ ] Reconnect with exponential backoff, keepalive pings
- [ ] `server/schemas.py` — Pydantic models: `TranscriptMessage`, `SuggestionMessage`, `ErrorMessage`
- [ ] Server pushes transcript events to the browser as JSON over the same WebSocket
- [ ] `client/app.js` renders transcript in the left panel with speaker labels and timestamps
- [ ] Commit: `feat: deepgram streaming transcription with speaker labels`

**Exit criterion:** Say "testing one two three" into mic → shows up in left panel labeled "Rep" within 2 seconds. Play a podcast → shows up labeled "Prospect."

---

### Session 4 — Coaching engine (hours 10–16)
**Target:** 4–6 hours
**Goal:** Claude generates coaching suggestions from the rolling transcript, pushed to the browser every 7 seconds (or immediately on a critical moment).
**Tasks:**
- [ ] `server/prompt.py` — the coaching prompt as a Python string (from `docs/coaching-prompt.md`)
- [ ] `server/coaching.py` — rolling 90-second buffer, 7-second debounce, critical-moment regex trigger
- [ ] Anthropic SDK call with `claude-sonnet-4-6`, `max_tokens=200`, `temperature=0.3`
- [ ] Parse JSON response (tolerate markdown fences), validate with Pydantic
- [ ] Push suggestions to browser; `client/app.js` renders them in the right panel, newest on top
- [ ] Commit: `feat: claude coaching engine with rolling buffer and debounce`

**Exit criterion:** Hold a 2-minute mock conversation with a friend → at least 3 suggestions appear, each referencing something specific from the conversation (not generic).

**Do not optimize the prompt until the loop works end-to-end.** Iterating on prompt quality is Session 6.

---

### Session 5 — Polish + critical moments (hours 16–22)
**Target:** 4–6 hours
**Goal:** UI is demo-ready, critical-moment trigger fires reliably, Start/Stop works cleanly.
**Tasks:**
- [ ] Start/Stop session button — closes Deepgram connections, clears buffer
- [ ] Transcript auto-scroll, speaker color coding (green = Rep, blue = Prospect)
- [ ] Suggestion cards with category icons (💬 Say / ❓ Ask / ⚠️ Watch out)
- [ ] Timestamps on everything
- [ ] Critical-moment keyword regex — verify it triggers immediately on "too expensive", "competitor", "think about it"
- [ ] Error states — Deepgram disconnect, Claude API error, mic permission denied
- [ ] Commit: `feat: polished UI with start/stop and critical moments`

**Exit criterion:** Full flow works in a single click-Start, talk-for-2-minutes, click-Stop cycle with no manual intervention.

---

### Session 6 — Prompt tuning on real calls (hours 22–30)
**Target:** 4–8 hours. **This is where the demo gets good.**
**Goal:** Run 3–4 real mock Zoom calls, capture transcripts, refine the coaching prompt based on what's generic vs what lands.
**Tasks:**
- [ ] Do a real Zoom call with a friend playing "eCommerce Director considering Optimum7"
- [ ] Capture the full transcript + every suggestion generated
- [ ] Grade each suggestion: useful / generic / wrong. If >30% are generic, the prompt needs more Optimum7 context.
- [ ] Tune the prompt iteratively — more specificity in the Rules section, more realistic examples
- [ ] Repeat with a different friend / scenario
- [ ] Commit: `feat: tuned coaching prompt from 4 real mock calls`

**Exit criterion:** On a fresh call, ≥60% of suggestions reference something specific the prospect said. Zero fabricated Optimum7 facts.

**This session is the single biggest differentiator in the evaluation.** Relevance is what separates a demo from a toy.

---

### Session 7 — Demo recording (hours 30–38)
**Target:** 4–8 hours (yes, recording takes this long)
**Goal:** A 3–5 minute demo video that a stranger can watch and understand.
**Tasks:**
- [ ] Write a short script: (1) what CallWhisper does, (2) live demo, (3) architecture highlights, (4) what's next
- [ ] Do a dry-run mock call — know what your "prospect friend" will say so the suggestions are interesting
- [ ] Record with clear audio (lavalier or good headset, not laptop mic)
- [ ] Show the UI, the suggestions appearing in real time, and briefly show the code structure
- [ ] Cut anything over 5 minutes — Serhat's time is limited
- [ ] Commit the video (or a link): `docs: demo video`

**Exit criterion:** You can watch your own demo back and would watch it again if you were the hiring manager.

---

### Session 8 — README + final polish + handoff (hours 38–48)
**Target:** 4–6 hours, plus buffer for anything broken
**Goal:** Ship.
**Tasks:**
- [ ] Update `README.md` with real setup instructions tested on a fresh clone
- [ ] Fill in `docs/prompts.md` with the 5–10 best prompts from the build
- [ ] Organize Claude Code session logs / screen recordings into `.claude-sessions/`
- [ ] Re-test the full flow on a fresh Zoom call
- [ ] Push final commits
- [ ] Email Serhat: demo link, repo link, brief note
- [ ] Commit: `docs: final README and prompt log`

**Exit criterion:** A stranger can clone the repo, follow the README, and get a working demo on their machine.

---

## Buffer time: 4–6 hours

The schedule above sums to ~42 hours. The remaining time is buffer for:
- BlackHole problems on your specific macOS version
- Deepgram latency surprises
- Claude API rate limits on the final testing rush
- One thing breaking at hour 44 that you didn't expect

**Do not spend buffer time on features.** Spend it on making what exists more reliable.

---

## Feature cut list (in order)

If we fall behind, cut from the bottom first:

1. Multi-suggestion history scroll — just show the latest
2. Session Start/Stop button — hard-refresh to reset
3. Speaker color coding
4. Error UI states — just log to console
5. Critical-moment regex — ship with 7-second debounce only
6. One of the three suggestion categories — `say_this` is the most impressive to demo

**Never cut:** dual audio capture, speaker labels, any coaching output, the demo video.

---

## Session log

Append an entry here after every session. Keep it honest — this is for you, not for Serhat (but he'll read it).

**Template:**
```
### Session N — <title> (hour X → Y)
- Done: …
- Broke: …
- Learned: …
- Next: Session N+1
```

---

### Session 0 — Pre-kickoff setup (hour -1 → 0)
- Done:
- Broke:
- Learned:
- Next:

---

### Session 1 — Scaffolding (hour 0 → 3.5)
- Done: cleaned up messy git history (3 root "first commit" + "test" → 3 conventional commits), scaffolded FastAPI server with /health and /ws JSON ping/echo, vanilla JS frontend with two-panel layout and WebSocket handshake, lifespan context manager, Pydantic schemas inline, mypy --strict clean, pushed to GitHub
- Broke: rejected first __init__.py write by accident (recovered immediately); had stale staging from pre-kickoff that needed history reset
- Learned: scope discipline check on @app.on_event deprecation paid off — single approved refactor, no creep; pre-session context confirmation prompt prevents Claude Code from jumping to code; git status shows .env is properly ignored
- Next: Session 2 — audio capture end-to-end

---

### Session 2 — Audio capture end-to-end (hour 3.5 → 5)
- Done: dual getUserMedia for mic + VB-Cable, AudioWorklet processor with average-pooling downsampling (48kHz → 16kHz, ratio 3.0), binary frame protocol with channel tags, pending queue with overflow handling, device picker fallback, server receive loop handling text/binary, browser tested and verified — both channels flowing at ~10 frames/sec interleaved with no drops
- Broke: nothing material — initial Claude Code plan used nearest-neighbor downsampling which would have caused aliasing; corrected to average pooling pre-implementation
- Learned: average pooling provides built-in low-pass filtering for free; AudioWorklet sampleRate global handles device variability cleanly; binary + text in single WebSocket via FastAPI receive() works without ceremony
- Next: Session 3 — Deepgram streaming integration

---

### Session 3 — Deepgram streaming integration (hour 5 → 10.5)
- Done: server/schemas.py with TranscriptMessage, server/deepgram_client.py with async per-channel streaming + reconnect + keepalive + frame queue, main.py routing binary frames to Deepgram and TranscriptMessage to browser via outbound queue, client rendering interim/final transcripts with colors, always-visible device picker with Test buttons, Start/Stop toggle. Verified real transcription end-to-end.
- Broke: spent ~2h debugging RMS=0 (silent frames). Root cause was Voicemeeter routing: Windows default output had to be CABLE Input, prospect channel had to read from CABLE Output. Once routed correctly, Deepgram returned accurate transcripts immediately.
- Learned: device picker fallback was essential — auto-detect by regex isn't enough on Windows where users may have many similarly-named virtual audio devices. Test button per channel with live RMS lets users verify capture before starting a real session. Production-grade pattern.
- Next: Session 4 — Claude coaching engine

---

### Session 4 — Claude coaching engine (hour 10.5 → 11.5)
- Done: server/prompt.py with SYSTEM_PROMPT constant copied from docs/coaching-prompt.md, server/coaching.py with CoachingEngine class (90s rolling buffer, 7s asyncio debounce, 4s minimum gap between Claude calls, critical-moment regex bypass for objection/stall/competitor/authority/timing patterns), schemas.py extended with flat SuggestionMessage (say_this/ask_this/watch_out optional), main.py wires one CoachingEngine per WS session and routes finals to engine.add_transcript, client renders suggestions in right panel with green/blue/amber color coding, max 10 visible.
- Verified: 30s mock dialogue with objection phrases ("disaster", "expensive") produced 2 suggestion cards. First card: tied budget objection to agency-burn signal, gave specific say_this + ask_this + watch_out. Second card: detected garbled prospect audio and warned the rep instead of fabricating coaching. Latency: 3s on critical-moment trigger, ~10s on debounce — both inside SOW 5-10s spec.
- Notes: prompt grounding is working — Claude refused to invent Optimum7 facts and instead alerted on bad audio feed. The "silence is a feature" rule + "never invent facts" rule are doing real work.
- Next: sleep, then Session 5 — UI polish + critical-moment end-to-end verification + Stop session edge cases.

---

### Session 7 — Demo video recording (hour 16.5 → 18.5)
- Done: installed OBS Studio for screen + multi-track audio capture,
  reconfigured Voicemeeter Banana so I can hear ChatGPT through
  headphones while CABLE Input still receives system audio
  (VOICEMEETER VAIO routes to A1 headphones + A2 CABLE Input
  simultaneously). Wrote demo script (~3 min): 30s intro/stack,
  2 min mock-call replay with 4 beats from the eval rig, 30s outro.
  Recorded in OBS, light-edited in Clipchamp (trim head/tail),
  exported 1080p mp4, uploaded as Unlisted YouTube.
- Link: https://youtu.be/aj_hfYItWkY
- Notes: chose Beat 1, 2, 3, 4 (skipped 5-6 to keep demo tight).
  Beat 2 (burned-by-agency) is the wow moment — Claude references
  the prospect's own PDP redesign and 12% mobile drop in its
  ask_this. Watch_out flagged "burned by agency, needs proof"
  contextually.
- Broke: nothing major. First take had a small audio level imbalance
  (ChatGPT louder than my mic), Voicemeeter VAIO slider tweak
  (-3dB) on retake fixed it.
- Learned: OBS + Voicemeeter is the right Windows demo stack.
  ChatGPT Voice as the prospect rig is a great repeatable asset
  for both eval and demo — same prompt, same beats, predictable
  pacing.
- Next: Session 8 — README + Serhat handoff email.

---

### Session 6 — Prompt tuning evaluation (hour 14 → 16.5)
- Done: drafted mock B2B discovery call script (docs/mock-call-script.md),
  ran Round 1 evaluation with ChatGPT Voice driving prospect voice,
  recorded results in docs/prompt-evaluation.md. 4/4 tested beats
  produced specific, fact-grounded coaching. Agency-burn coaching
  referenced PDP and mobile-drop numbers from prospect's own line —
  the kind of specificity that turns generic LLM output into a real
  demo moment.
- Broke: Beat 4 produced internally inconsistent coaching once
  (dropped a $8k figure then flagged "pricing anchor too early").
  Self-corrected on next tick. Decided to ship as-is rather than
  tune narrowly and risk regression on the strong patterns.
- Learned: ChatGPT Voice is a great test rig. Edge TTS works too
  but Voice mode is friction-free. Both feed CABLE Output cleanly
  if Windows default output is set to CABLE Input.
- Next: Session 7 — demo video recording.

---

### Session 5 — UI polish + Stop/Start edge cases (hour 11.5 → 13.5)
- Done: Stop/Start cycle is clean (no ghost transcripts, no leaked
  AudioContexts, no panel state pollution). Auto-select on page load:
  Rep matches default/HyperX/Fifine, Prospect matches CABLE Output
  with amber warning if absent. Empty state placeholders in both
  panels. WS disconnect handling: red status + toast banner. Status
  indicator now a colored CSS dot. Suggestion cards have entrance
  animation. Diagnostic logs purged from client and server (kept
  only production-relevant logs).
- Broke: tried claude-sonnet-4-6 to take advantage of newer model.
  Sonnet 4.6 was too conservative with our prompt — kept returning
  empty {} JSON ("silence is a feature" rule applied too strictly).
  Reverted to claude-sonnet-4-5 which is proven working baseline.
  Will re-evaluate 4.6 during Session 6 prompt tuning.
- Learned: model upgrades aren't free. Newer models can have stricter
  prior-following, which interacts unexpectedly with prompt rules
  like "stay silent if uncertain". Always test on a real session
  before assuming a swap is invisible.
- Next: Session 6 — prompt tuning on real mock calls.

---

<!-- New session entries go above this line -->
