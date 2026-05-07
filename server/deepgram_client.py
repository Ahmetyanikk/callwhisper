import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Literal, TypeAlias

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)

OnTranscriptCallback: TypeAlias = Callable[
    [Literal["rep", "prospect"], str, bool, int], Awaitable[None]
]

_DG_BASE = "wss://api.deepgram.com/v1/listen"
_QUEUE_MAXSIZE = 200
_KEEPALIVE_INTERVAL = 8.0
_MAX_RECONNECT_ATTEMPTS = 5


class DeepgramStream:
    def __init__(
        self,
        api_key: str,
        channel: Literal["rep", "prospect"],
        on_transcript: OnTranscriptCallback,
        model: str = "nova-2",
        language: str = "en-US",
        sample_rate: int = 16000,
        encoding: str = "linear16",
        endpointing: int = 300,
    ) -> None:
        self.channel = channel
        self._api_key = api_key
        self._on_transcript = on_transcript
        self._url = (
            f"{_DG_BASE}"
            f"?model={model}&language={language}"
            f"&encoding={encoding}&sample_rate={sample_rate}"
            f"&channels=1&interim_results=true&smart_format=true"
            f"&punctuate=true&endpointing={endpointing}"
        )
        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
        self._running = False
        self._ws: ClientConnection | None = None
        self._tasks: list[asyncio.Task[None]] = []

    def start(self) -> None:
        self._running = True
        self._tasks = [
            asyncio.create_task(
                self._connect_loop(), name=f"dg-connect-{self.channel}"
            ),
            asyncio.create_task(
                self._keepalive_loop(), name=f"dg-keepalive-{self.channel}"
            ),
        ]

    async def send_audio(self, pcm: bytes) -> None:
        if not self._running:
            return
        try:
            self._queue.put_nowait(pcm)
        except asyncio.QueueFull:
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._queue.put_nowait(pcm)
            logger.warning("[%s] audio buffer full, dropped oldest frame", self.channel)

    async def close(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    async def _connect_loop(self) -> None:
        attempt = 0
        while self._running and attempt < _MAX_RECONNECT_ATTEMPTS:
            try:
                logger.info("[%s] connecting to Deepgram", self.channel)
                async with connect(
                    self._url,
                    additional_headers={"Authorization": f"Token {self._api_key}"},
                ) as ws:
                    self._ws = ws
                    logger.info("[%s] Deepgram connected", self.channel)
                    attempt = 0  # reset on successful connect
                    send_task = asyncio.create_task(
                        self._send_loop(ws), name=f"dg-send-{self.channel}"
                    )
                    try:
                        await self._receive_loop(ws)
                    finally:
                        send_task.cancel()
                        await asyncio.gather(send_task, return_exceptions=True)
                        self._ws = None
                        logger.info("[%s] Deepgram disconnected", self.channel)
            except asyncio.CancelledError:
                self._ws = None
                raise
            except Exception as exc:
                self._ws = None
                attempt += 1
                if not self._running:
                    break
                delay = min(2 ** (attempt - 1), 10)
                logger.warning(
                    "[%s] connection error (%s), attempt %d/%d, retry in %ds",
                    self.channel,
                    exc,
                    attempt,
                    _MAX_RECONNECT_ATTEMPTS,
                    delay,
                )
                try:
                    await asyncio.sleep(delay)
                except asyncio.CancelledError:
                    break

        if attempt >= _MAX_RECONNECT_ATTEMPTS:
            logger.error(
                "[%s] exhausted %d reconnect attempts, giving up",
                self.channel,
                _MAX_RECONNECT_ATTEMPTS,
            )

    async def _send_loop(self, ws: ClientConnection) -> None:
        sent = 0
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                await ws.send(frame)
                sent += 1
                if sent % 50 == 0:
                    logger.info("[%s] sent %d frames, queue=%d", self.channel, sent, self._queue.qsize())
        except (asyncio.CancelledError, ConnectionClosed):
            pass

    async def _receive_loop(self, ws: ClientConnection) -> None:
        async for raw in ws:
            if not isinstance(raw, str):
                continue
            try:
                data: dict[str, object] = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if data.get("type") != "Results":
                continue

            channel_data = data.get("channel")
            if not isinstance(channel_data, dict):
                continue
            alternatives = channel_data.get("alternatives")
            if not isinstance(alternatives, list) or not alternatives:
                continue
            first = alternatives[0]
            if not isinstance(first, dict):
                continue

            text_raw = first.get("transcript")
            if not isinstance(text_raw, str):
                continue
            text = text_raw.strip()
            if not text:
                continue

            is_final = bool(data.get("is_final", False))
            start_raw = data.get("start", 0.0)
            start_ms = int((start_raw if isinstance(start_raw, (int, float)) else 0.0) * 1000)

            if is_final:
                logger.info("[%s] %s", self.channel.upper(), text[:80])
            else:
                logger.debug("[%s] interim: %s", self.channel.upper(), text[:80])

            await self._on_transcript(self.channel, text, is_final, start_ms)

    async def _keepalive_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(_KEEPALIVE_INTERVAL)
            except asyncio.CancelledError:
                break
            if self._ws is not None:
                try:
                    await self._ws.send(json.dumps({"type": "KeepAlive"}))
                    logger.debug("[%s] keepalive sent", self.channel)
                except Exception as exc:
                    logger.warning("[%s] keepalive failed: %s", self.channel, exc)
