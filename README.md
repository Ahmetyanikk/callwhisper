# CallWhisper

Real-time AI sales coaching that listens to both sides of a live Zoom call and whispers suggestions to the rep while the conversation is still happening.

**Demo (5 min, unlisted):** https://youtu.be/aj_hfYItWkY

---

## The Big Decisions

This is the section worth reading. The implementation is straightforward — the interesting choices are in the product and prompt design.

### Why claude-sonnet-4-5, not Opus or Sonnet 4.6

Latency matters here. The SOW specifies coaching suggestions within 5–10 seconds of a trigger. Opus 4.7 is smarter, but TTFT on a ~1,500-token prompt is 2–3 seconds — that's before the model starts generating. Sonnet 4.5 returns the first token in ~400ms and the full JSON in ~1.2 seconds, which leaves comfortable headroom before the suggestion feels stale.

I did test Sonnet 4.6. Same latency profile, but it applied the "stay silent if uncertain" rule too aggressively — returned `{}` on calls where 4.5 produced specific, useful coaching. This isn't a 4.6 flaw; it's a prompt interaction. A more directive prompt would likely unlock 4.6. I've flagged the finding in `docs/prompt-evaluation.md` for a future tuning pass. For this build, 4.5 is the proven baseline.

### Why flat JSON output, not a nested suggestions array

The original design had `{"suggestions": [{"category": "say_this", "text": "..."}]}`. I changed it to flat optional fields: `say_this`, `ask_this`, `watch_out`.

The reason: when given an array slot, the model defaults to filling it. Three suggestion slots become three suggestions, even when only one is warranted. Flat optional fields make omission natural — if there's no `ask_this`, the model just doesn't include the key. This, combined with the explicit "return `{}` if nothing useful applies" instruction, cut generic filler significantly. Silence is a feature.

### Why 90s rolling buffer + 7s debounce + 4s minimum gap + critical-moment regex bypass

The buffer holds the last 90 seconds of final transcripts — roughly one full exchange plus context. Shorter and the model loses thread; longer and the prompt gets expensive and the oldest context stops being relevant.

The 7-second debounce means: after any new transcript, wait 7 seconds before calling Claude. If more transcripts arrive in that window, reset the timer. This prevents firing on every word fragment while staying responsive to natural conversation pauses.

The 4-second minimum gap between any two Claude calls prevents thrashing when the debounce and the critical-moment regex fire near-simultaneously.

The critical-moment regex bypasses the debounce entirely on phrases like "too expensive," "think about it," "competitor," "have to run it by." These are objection signals — waiting 7 seconds to respond to "we've been burned by agencies before" is too slow. The math: ~8 Claude calls per 60-second active conversation, at roughly 500 prompt tokens each, costs less than $0.01 per session.

### Why channel-based speaker labeling, not diarization

Deepgram's diarization works by clustering speaker voice embeddings across a single audio stream. It's impressive but adds ~200ms latency and occasionally mis-assigns speakers in overlapping speech.

I don't need it. The rep's mic and the prospect's system audio are physically separate sources — there's no ambiguity about who said what. Routing them into two Deepgram connections and tagging frames with a channel byte at the source is more accurate, faster, and cheaper. The only limitation is that multi-party prospect calls collapse all Zoom-side speakers into "Prospect," which is documented as a known edge case.

### Why finals-only feed the coaching buffer

Deepgram streams both interim (in-progress) and final transcripts. Interims arrive quickly but contain fragments, corrections, and restarts. Feeding them into the coaching buffer would pollute the context Claude sees — the model would coach on half-sentences and then the same content again when finalized. Finals only means the buffer is clean, coherent turns. Interims are still rendered in the transcript panel so the rep sees real-time speech, but they don't touch the coaching engine.

### Why the prompt has an explicit "never invent Optimum7 facts" rule with a "frame as question" escape valve

Without this constraint, Claude will confidently fabricate Optimum7 case studies, client names, and specific results when they'd strengthen a coaching suggestion. On a live sales call, the rep repeating a hallucinated client reference would be a serious problem.

The escape valve matters: instead of just prohibiting invention, the prompt gives the model an alternative — "frame it as a question to the rep: 'Do we have a Shopify CRO case study around cart abandonment we can reference?'" This preserves usefulness. During testing, the model correctly alerted on garbled audio rather than fabricating coaching to fill the silence. That behavior is exactly what the rule is designed to produce.

---

## Architecture

One WebSocket between browser and server carries everything: binary audio frames outbound, JSON transcript and suggestion messages inbound. Keeping it to a single connection avoids multiplexing complexity and makes the demo path easy to follow in DevTools.

```
Browser AudioWorklet (16kHz PCM, 100ms frames, 1-byte channel tag)
    |
    | WebSocket (binary + JSON over same connection)
    v
FastAPI server — routes binary frames per channel tag
    |
    +---> DeepgramStream [rep]      DeepgramStream [prospect]
    |           |                           |
    |     final transcripts           final transcripts
    |           +------------+-------------+
    |                        v
    |              CoachingEngine
    |         (90s rolling buffer, 7s debounce,
    |          4s min gap, critical-moment regex)
    |                        |
    |               Claude Sonnet 4.5
    |         (system prompt + last 90s transcript)
    |                        |
    |              JSON suggestion parsed
    |                        |
    +<---- asyncio.Queue (single outbound sender task)
    |
    v
Browser: left panel (transcript) + right panel (coaching cards)
```

The outbound queue and single sender task exist to prevent concurrent `websocket.send_text` calls, which FastAPI doesn't allow.

---

## Evaluation

I ran a structured evaluation before recording the demo. Full methodology and beat-by-beat results are in `docs/prompt-evaluation.md`. The eval script is in `docs/mock-call-script.md` — it's reproducible with ChatGPT Voice mode as the prospect.

Summary: 4 of 4 tested beats produced specific, fact-grounded coaching tied to what the prospect actually said. The standout was Beat 2 (burned-by-agency): the prospect mentioned a "$60k engagement, PDP redesign, 12% mobile conversion drop," and Claude's coaching referenced those specific numbers in its `ask_this` and `watch_out` fields. That specificity — grounding suggestions in the prospect's own words rather than generic sales advice — is the thing the demo is trying to show.

One known weakness: Beat 4 (budget locked + price-first ask) showed the model dropping a pricing figure and then flagging "pricing anchor too early" in the same response. Inconsistent. It self-corrected on the next tick as the transcript context grew. I decided against further tuning because the strong patterns were holding and the inconsistency had a natural resolution mechanism.

---

## What's Explicitly Out of Scope

Deliberate cuts, not oversights.

- **Objection classifier ML model** — rules plus LLM judgment beat a thin classifier at this scope. An ML classifier would need labeled training data and adds a serving dependency for marginal accuracy gain on a small objection taxonomy.
- **RAG over Optimum7 case studies** — no curated corpus available. Retrieval without grounding just increases hallucination surface area. The "frame as question" escape valve in the prompt handles this more safely.
- **Post-call scoring and analytics** — not in the SOW minimum bar. Clean phase-2 feature once there's a data store.
- **Multi-suggestion history scroll** — showing the latest 10 cards is enough for a demo. History browsing adds UI complexity without changing what the rep actually does during a live call.
- **Pre-call research and lead enrichment** — orthogonal to real-time coaching. Different product surface.
- **Auto-reconnect WebSocket** — I chose explicit user-driven Stop/Start over silent reconnection. Auto-reconnect creates edge cases around buffer state, duplicate Deepgram connections, and mid-session coaching context gaps. Predictable behavior matters more here than convenience.
- **macOS BlackHole audio** — this is a Windows-only build. BlackHole would replace VB-Cable on macOS with ~30 minutes of config changes. Not implemented because the dev environment is Windows 11.
- **Per-rep customization** — coaching tone and example library would vary by rep persona in production. Out of scope for the trial; phase-2 feature.
- **Suggestion deduplication across turns** — the coaching engine doesn't track that it just surfaced "ask about budget" and may surface the same angle again on the next tick. Acceptable for a 5-minute demo; needs cross-turn memory for a real deployment.

---

## Limitations

- **Windows-only audio capture.** VB-Audio Virtual Cable is Windows. BlackHole provides the same virtual audio routing on macOS but isn't wired up. Linux has PulseAudio loopback. Neither is implemented.
- **Single concurrent session per process.** Session state is in-memory, one WebSocket handler at a time. Not a problem for a demo; would need per-session isolation and a proper data store for production.
- **No persistence.** Transcripts and suggestions live only in the active WebSocket session. Refreshing the browser clears everything.
- **Beat 4 pricing inconsistency.** Documented in the evaluation. Self-corrects on the next debounce tick but would need prompt work before a production deployment where reps are citing pricing live.
- **Multi-party prospect calls.** All Zoom-side audio routes through a single virtual cable. If the prospect has multiple speakers, they're all labeled "Prospect." Diarization on the Zoom output channel would solve this but isn't implemented.

---

## Setup (Windows)

**Prerequisites**

- Python 3.11+
- [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) — installs CABLE Input / CABLE Output devices. Requires a restart.
- [Voicemeeter Banana](https://vb-audio.com/Voicemeeter/) — optional, only needed if you want to monitor the call audio through headphones while CABLE Input is receiving it.
- Deepgram API key — [console.deepgram.com](https://console.deepgram.com)
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

**Install**

```bash
git clone https://github.com/Ahmetyanikk/callwhisper.git
cd callwhisper
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: fill DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

**Audio routing — two scenarios**

*For testing with mock prospect audio (e.g. ChatGPT Voice as prospect):*

1. Open Windows Sound Settings → Output → set to **CABLE Input**
2. Any system audio (browser, ChatGPT, video player) now routes to CABLE Input, which CallWhisper reads as the Prospect channel
3. Optional: install Voicemeeter Banana to also send the same audio to your headphones (A1 + A2 simultaneous routing) so you can hear what's being captured

*For real Zoom calls:*

1. In Zoom → Settings → Audio → Speaker → select **CABLE Input**
2. The prospect's voice from Zoom routes to CABLE Input — CallWhisper reads it as Prospect
3. Your Zoom mic stays as your physical microphone — CallWhisper reads it as Rep
4. Voicemeeter is recommended here so you can still hear the prospect through your headphones during the call

**Run**

Two terminals:

```bash
# Terminal 1
uvicorn server.main:app --port 4000

# Terminal 2
python -m http.server 5173 --directory client
```

Open `http://localhost:5173`. Click **Start Session**.

On the device picker:
- **Rep mic** — auto-selects your physical microphone. Override if needed.
- **Prospect (system audio)** — auto-selects CABLE Output. A warning appears if no virtual audio device is detected.

Use the **Test** buttons to confirm both channels are receiving audio before starting a real call.

---

## Repo Layout

```
server/
  main.py              FastAPI app, WebSocket handler, binary frame routing
  deepgram_client.py   Per-channel Deepgram streaming with reconnect + keepalive
  coaching.py          CoachingEngine: rolling buffer, debounce, regex, Claude calls
  prompt.py            SYSTEM_PROMPT constant (source of truth: docs/coaching-prompt.md)
  schemas.py           Pydantic message types for all WebSocket traffic

client/
  index.html           Two-panel layout, device picker, session controls
  app.js               WebSocket lifecycle, audio capture, transcript + suggestion rendering
  processor.js         AudioWorklet PCM downsampler (device rate → 16kHz)
  styles.css           Dark theme, status indicator, suggestion card animation

docs/
  coaching-prompt.md   Full system prompt + design rationale for each decision
  mock-call-script.md  Reproducible 6-beat B2B discovery call script for eval + demo
  prompt-evaluation.md Round 1 evaluation results, beat-by-beat analysis

PLAN.md                48-hour session log — what got done, what broke, what's next
SOW.md                 Original trial task specification (unmodified)
CLAUDE.md              AI coding assistant context file
```

---

## Build process

Built in a single 48-hour window per the SOW. The work was organized as eight sessions, each with a clear scope and exit criterion, tracked in `PLAN.md`. Working in well-bounded sessions with explicit "what's broken, what's next" notes after each session was the single biggest contributor to staying on schedule when audio routing on Windows turned into a multi-hour debug.

The repo has 14 commits, all conventional, all on `main`. No force-pushes. `mypy --strict` passes on the server code. The full chronology is in `PLAN.md`.

---

## Attribution

Built by Ahmet Yanık as a 48-hour trial task for the Optimum7 / Zen Media AI Engineer role.
