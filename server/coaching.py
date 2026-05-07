import asyncio
import json
import logging
import re
import time
from typing import Any

import anthropic
from anthropic.types import TextBlock

from server.prompt import SYSTEM_PROMPT
from server.schemas import SuggestionMessage

logger = logging.getLogger(__name__)

CRITICAL_MOMENT_PATTERNS: re.Pattern[str] = re.compile(
    r"\b(too expensive|expensive|over budget|out of budget|"
    r"think about it|let me think|circle back|send me info|"
    r"not (?:the )?right time|next quarter|next year|"
    r"competitor|alternative|shopify plus|in.house|in house|"
    r"burned by|bad experience|"
    r"have to (?:run it by|check with|talk to)|"
    r"who (?:else )?(?:would be )?involved)\b",
    re.IGNORECASE,
)

_MODEL = "claude-sonnet-4-5"
_BUFFER_WINDOW_MS = 90_000
_DEBOUNCE_SECS = 7.0
_MIN_CALL_GAP_SECS = 4.0


def _opt_str(v: object) -> str | None:
    return v if isinstance(v, str) and v else None


class CoachingEngine:
    def __init__(self, api_key: str, out_queue: asyncio.Queue[str]) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._out_queue = out_queue
        self._buffer: list[tuple[str, str, int]] = []
        self._debounce_task: asyncio.Task[None] | None = None
        self._last_call_time: float = 0.0
        self._running = False

    def start(self) -> None:
        self._running = True

    async def close(self) -> None:
        self._running = False
        if self._debounce_task is not None and not self._debounce_task.done():
            self._debounce_task.cancel()
            await asyncio.gather(self._debounce_task, return_exceptions=True)

    async def add_transcript(self, speaker: str, text: str, ts_ms: int) -> None:
        if not self._running:
            return
        self._buffer.append((speaker, text, ts_ms))
        cutoff = ts_ms - _BUFFER_WINDOW_MS
        self._buffer = [(s, t, ts) for s, t, ts in self._buffer if ts >= cutoff]

        if CRITICAL_MOMENT_PATTERNS.search(text):
            logger.info("[coaching] critical moment detected: %.60s", text)
            asyncio.create_task(
                self._maybe_call_claude("critical"),
                name="coaching-critical",
            )

        if self._debounce_task is not None and not self._debounce_task.done():
            self._debounce_task.cancel()
        self._debounce_task = asyncio.create_task(
            self._debounce_fired(), name="coaching-debounce"
        )

    async def _debounce_fired(self) -> None:
        try:
            await asyncio.sleep(_DEBOUNCE_SECS)
        except asyncio.CancelledError:
            return
        await self._maybe_call_claude("debounce")

    async def _maybe_call_claude(self, trigger: str) -> None:
        if not self._running:
            return
        if time.monotonic() - self._last_call_time < _MIN_CALL_GAP_SECS:
            return
        self._last_call_time = time.monotonic()
        await self._call_claude(trigger)

    async def _call_claude(self, trigger: str) -> None:
        if not self._buffer:
            return

        lines = [
            f"[{time.strftime('%H:%M:%S', time.localtime(ts / 1000))}] {speaker}: {text}"
            for speaker, text, ts in self._buffer
        ]
        user_msg = (
            "The last 90 seconds of the call (most recent at the bottom):\n\n"
            + "\n".join(lines)
            + "\n\nWhat should I coach the Rep on right now?"
        )
        est_tokens = len(user_msg) // 4
        logger.info(
            "[coaching] calling Claude trigger=%s ~%d prompt tokens",
            trigger, est_tokens,
        )

        t0 = time.monotonic()
        try:
            response = await self._client.messages.create(
                model=_MODEL,
                max_tokens=200,
                temperature=0.3,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
        except Exception as exc:
            logger.warning("[coaching] API error: %s", exc)
            return

        elapsed = time.monotonic() - t0
        logger.info("[coaching] Claude responded in %.2fs", elapsed)

        block = response.content[0] if response.content else None
        if not isinstance(block, TextBlock):
            logger.warning("[coaching] unexpected response block type: %s", type(block))
            return

        raw = block.text.strip()
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()

        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("[coaching] parse failed: %s | raw=%.200s", exc, raw)
            return

        msg = SuggestionMessage(
            say_this=_opt_str(data.get("say_this")),
            ask_this=_opt_str(data.get("ask_this")),
            watch_out=_opt_str(data.get("watch_out")),
            ts=int(time.time() * 1000),
        )
        if msg.say_this is None and msg.ask_this is None and msg.watch_out is None:
            logger.debug("[coaching] nothing to emit (empty JSON)")
            return

        logger.info(
            "[coaching] emitting say=%.60s ask=%.60s watch=%.60s",
            msg.say_this or "",
            msg.ask_this or "",
            msg.watch_out or "",
        )
        await self._out_queue.put(msg.model_dump_json())
