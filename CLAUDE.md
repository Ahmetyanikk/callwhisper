# CLAUDE.md

**READ THIS FILE AT THE START OF EVERY SESSION. Then read `PLAN.md`. Then confirm what slice we're working on before writing any code.**

---

## What this is

CallWhisper is a real-time sales coaching prototype for Optimum7. During a live Zoom call it captures two audio streams (rep mic + prospect via BlackHole), transcribes both with speaker labels, and streams coaching suggestions from Claude back to the rep.

This is a **48-hour trial task**. The goal is to ship a working demo, not to build production software. Every design decision prioritizes shipping speed over elegance.

The full task spec is in `SOW.md` in the repo root. The minimum bar we must hit is in SOW section 6. Read it before suggesting any feature.

---

## Tech stack

**Backend: Python 3.11+**
- `fastapi` — HTTP + WebSocket server
- `uvicorn` — ASGI server
- `websockets` — for the outbound Deepgram connection
- `anthropic` — official Claude SDK
- `python-dotenv` — env var loading
- `pydantic` — for message schemas (we already depend on it via FastAPI, use it)

**Frontend: plain HTML + vanilla JavaScript**
- No React. No build step. No bundler.
- Single `index.html`, single `app.js`, single `styles.css`.
- Two reasons: (1) zero build-chain risk in a 48-hour window, (2) the reviewer can read the entire frontend in one sitting.

**External services**
- Deepgram streaming API (`nova-2` model) — transcription
- Anthropic API (`claude-sonnet-4-6`) — coaching
- BlackHole 2ch — virtual audio device for capturing Zoom output

**Target platform**
   - Primary dev: Windows 11 + Chrome/Edge + Zoom desktop
   - Virtual audio: VB-Cable + Voicemeeter Banana
   - macOS port: documented in README, ~30-minute swap to BlackHole

**What we are NOT using (and why)**
- Not using Node.js — candidate is stronger in Python, SDK ergonomics are better there.
- Not using React/Vue/Svelte — build tooling is a time sink for a 2-panel UI.
- Not using a database — session state is in-memory, lost on restart, that's fine for a demo.
- Not using Docker — adds setup friction for the reviewer; `uvicorn` + `python -m http.server` is enough.
- Not using a task queue, Redis, or any infra — one process, in-memory state.
- Not using Whisper or AssemblyAI — Deepgram is in the SOW as preferred; don't re-evaluate.

---

## Project layout

```
callwhisper/
├── CLAUDE.md              # this file
├── PLAN.md                # 48-hour timeline, update after each session
├── SOW.md                 # the trial task spec, do not edit
├── README.md              # for Serhat; polish in final session
├── .env.example
├── .gitignore
├── requirements.txt
├── pyproject.toml         # optional, use if we need it
├── docs/
│   ├── coaching-prompt.md # the tuned system prompt + rationale
│   └── prompts.md         # our best Claude Code prompts from this build
├── scripts/
│   ├── setup-audio.sh     # BlackHole install + Multi-Output Device
│   ├── test-capture.sh    # serves the capture test page
│   └── test-capture.html  # standalone dual-waveform test
├── server/
│   ├── __init__.py
│   ├── main.py            # FastAPI app + WebSocket endpoint
│   ├── deepgram_client.py # one instance per channel, reconnect logic
│   ├── coaching.py        # rolling buffer + throttled Claude calls
│   ├── prompt.py          # the coaching prompt as a const
│   └── schemas.py         # pydantic message shapes
└── client/
    ├── index.html
    ├── app.js             # dual capture, WS to server, renders both panels
    └── styles.css
```

If you're about to create a file outside this layout, stop and ask first.

---

## How it all fits together (the shape of the loop)

```
Browser:
  - getUserMedia(default mic)        → rep stream
  - getUserMedia(BlackHole)          → prospect stream
  - AudioWorklet downsamples both to 16kHz PCM16, 100ms frames
  - Sends frames over one WebSocket to the backend
  - Each frame is prefixed with 1 byte: 0x01 = rep, 0x02 = prospect

Backend (single WebSocket handler per session):
  - Opens TWO Deepgram streaming connections (one per channel)
  - Forwards incoming frames to the right Deepgram stream based on the tag byte
  - Receives transcript events from Deepgram (interim + final)
  - Pushes transcript events back to the browser
  - Maintains a rolling 90-second transcript buffer (list of (speaker, text, ts))
  - Every 7 seconds OR on critical-moment trigger: sends buffer to Claude
  - Pushes coaching suggestions back to the browser

Browser:
  - Left panel: renders transcript as it streams in
  - Right panel: renders coaching suggestions, newest on top
```

There's only one WebSocket between browser and server, carrying binary audio frames and JSON control/transcript/suggestion messages. Keep it that way — two sockets would double the complexity for no benefit.

---

## Coding conventions

**Python**
- Type hints on every function signature. `mypy --strict` should pass on everything in `server/`.
- Use `async`/`await` end-to-end. No blocking calls inside the event loop.
- No bare `except:`. Always catch specific exceptions. If you catch it, either handle it or re-raise with context.
- No `print()` for anything that survives past the next commit. Use the `logging` module with a module-level `logger = logging.getLogger(__name__)`.
- Pydantic models for all WebSocket messages. No dicts floating around.
- Top-level functions and classes over lambdas and inline arrow-style closures.
- Imports: stdlib, third-party, local — separated by blank lines.

**JavaScript**
- ES modules, no bundler. `<script type="module" src="app.js">`.
- No `var`. Prefer `const`, use `let` only when reassignment is real.
- No frameworks. Touch the DOM directly — `document.querySelector`, `element.textContent`, `element.classList`.
- Keep `app.js` under 400 lines. If it's growing past that, split into `audio.js`, `transport.js`, `ui.js`.

**Both**
- Comments explain *why*, never *what*. If the code needs a comment to explain what it does, rewrite the code.
- No files over 300 lines. If you're approaching it, split.
- No default exports (not applicable in Python, but for JS: always named exports).

---

## Scope discipline (read this twice)

This is a 48-hour prototype for a trial task. **Do NOT:**

- Add input validation beyond what's needed to not crash. No Zod/Pydantic-for-the-sake-of-it.
- Build a config system. Env vars loaded via `os.getenv` is enough.
- Abstract "for future flexibility." YAGNI.
- Write unit tests for trivial code. One integration smoke test is more valuable than 40 unit tests here.
- Install new dependencies without asking me first.
- Refactor code that already works.
- Add features beyond what SOW sections 2 and 3 describe.
- Polish code that isn't on the demo path.
- Try to solve acoustic echo cancellation. The rep wears headphones. This is a documented limitation, not a bug.
- Try to handle multi-party prospect calls with diarization. Both Zoom-side speakers get labeled "Prospect". Documented limitation.
- Add authentication, user accounts, or session persistence. One user, one session, in-memory.

**Every minute spent on the above is a minute not spent on the demo video.**

If you think the project needs one of these things, say so explicitly and let me decide. Don't just add it.

---

## What "done" means

The minimum bar from SOW section 6, copied here so you don't have to look it up:

1. Two audio streams (rep + prospect) captured separately during a live Zoom call.
2. Live transcript with correct speaker labels and sub-2-second partial latency.
3. At least one coaching suggestion category (Say this / Ask this / Watch out) generated in real time from the live transcript.
4. Working demo on a real or simulated Zoom call, delivered within 48 hours.

Everything else is nice-to-have. If we're behind schedule, cut features, not the demo.

---

## Commands

```bash
# Setup (once)
./scripts/setup-audio.sh              # install BlackHole, set up Multi-Output Device
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # fill in DEEPGRAM_API_KEY + ANTHROPIC_API_KEY

# Verify audio before coding anything
./scripts/test-capture.sh             # opens the dual-waveform test page

# Run the app
uvicorn server.main:app --reload --port 4000
# in another terminal:
python -m http.server 5173 --directory client
# open http://localhost:5173

# Type check
mypy server/

# Smoke test (once we build it)
python -m pytest tests/test_smoke.py -v
```

Always run `mypy server/` before committing. If it fails, fix it — do not add `# type: ignore`.

---

## Git workflow

- Branch: just work on `main`. No PRs, no review — it's a trial.
- Commit after every working slice, even if small. Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`.
- Never commit `.env`, `.venv/`, `__pycache__/`, `*.pyc`, `.claude-sessions/`.
- Push to the private repo early so Serhat can see activity. Empty-ish initial commits are fine.

---

## Session protocol

At the start of every Claude Code session:

1. Read this file.
2. Read `PLAN.md` to see what slice we're on.
3. Read the SOW section most relevant to the slice.
4. Before writing code, propose the approach in ~10 bullets and wait for approval.
5. After writing code, run `mypy server/` and the smoke test. Paste the output.
6. On success: commit, update `PLAN.md`, stop. Don't start the next slice in the same session.

At the end of every session:

- Update `PLAN.md` with: what got done, what broke, what's next.
- Commit with a conventional message.
- Note any hacks or TODOs inline with `# TODO(callwhisper):` so they're greppable.

---

## Anti-patterns to refuse

If I ask for any of these, push back before doing them:

- "Just use `any` / `# type: ignore` to make the error go away"
- "Let's add retries with exponential backoff to [thing that doesn't need them]"
- "Refactor this to be more testable" (we're not writing unit tests)
- "Let's switch to [new library] because it's cleaner" (not in 48 hours)
- "I'll handle this edge case" (only if it's on the demo path)

---

## On inventing facts about Optimum7

Never invent Optimum7 case studies, client names, pricing, or specific results in the coaching prompt, UI copy, README, or demo narration. If a proof point would be useful, frame it as a question for the rep to answer on the call, not a claim the AI makes.

---

## Success signals

When this project is going well, it looks like:

- Small, frequent commits on `main`
- `mypy` clean on every commit
- New session per slice, each under 90 minutes
- The transcript panel and suggestion panel both work end-to-end by hour 24
- Hours 36–48 are entirely about real-Zoom testing, demo recording, and README polish — not coding

When it's going poorly, it looks like:

- One giant 4-hour session that produces 2000 lines of untested code
- Type errors silenced instead of fixed
- New dependencies added without discussion
- The UI being built before the capture→transcribe→coach loop works end-to-end
- Spending time on phase-2 features (RAG, objection classifier) instead of the minimum bar
