"""CallWhisper server — FastAPI app with health check and WebSocket endpoint."""

import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from itertools import count
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from server.deepgram_client import DeepgramStream
from server.schemas import EchoMessage, ErrorMessage, PingMessage, TranscriptMessage

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("callwhisper")

_client_ids = count(1)



@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    missing = [
        key
        for key in ("DEEPGRAM_API_KEY", "ANTHROPIC_API_KEY")
        if not os.getenv(key)
    ]
    if missing:
        logger.warning("Missing env vars: %s — set them in .env", ", ".join(missing))
    logger.info("callwhisper server ready")
    yield


app = FastAPI(title="CallWhisper", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    client_id = next(_client_ids)
    await websocket.accept()
    logger.info("ws connected: %s", client_id)

    # Single queue + one sender task prevents concurrent websocket.send_text calls.
    out_queue: asyncio.Queue[str] = asyncio.Queue()

    async def on_transcript(
        channel: Literal["rep", "prospect"],
        text: str,
        is_final: bool,
        start_ms: int,
    ) -> None:
        msg = TranscriptMessage(
            channel=channel,
            text=text,
            is_final=is_final,
            ts=int(time.time() * 1000),
            start_ms=start_ms,
        )
        await out_queue.put(msg.model_dump_json())

    async def sender() -> None:
        try:
            while True:
                payload = await out_queue.get()
                await websocket.send_text(payload)
        except (asyncio.CancelledError, WebSocketDisconnect):
            pass

    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    rep_stream = DeepgramStream(
        api_key=api_key, channel="rep", on_transcript=on_transcript
    )
    prospect_stream = DeepgramStream(
        api_key=api_key, channel="prospect", on_transcript=on_transcript
    )
    rep_stream.start()
    prospect_stream.start()
    sender_task = asyncio.create_task(sender(), name=f"ws-sender-{client_id}")

    frame_counts: dict[str, int] = {"rep": 0, "prospect": 0}

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            msg_bytes = message.get("bytes")
            msg_text = message.get("text")

            if isinstance(msg_bytes, (bytes, bytearray)) and msg_bytes:
                tag = msg_bytes[0]
                payload = bytes(msg_bytes[1:])
                if tag == 0x01:
                    await rep_stream.send_audio(payload)
                    frame_counts["rep"] += 1
                    if frame_counts["rep"] % 50 == 0:
                        logger.info("[REP] forwarded %d frames", frame_counts["rep"])
                elif tag == 0x02:
                    await prospect_stream.send_audio(payload)
                    frame_counts["prospect"] += 1
                    if frame_counts["prospect"] % 50 == 0:
                        logger.info("[PROSPECT] forwarded %d frames", frame_counts["prospect"])
                else:
                    logger.warning("unknown channel tag: 0x%02x", tag)

            elif isinstance(msg_text, str) and msg_text:
                try:
                    data = json.loads(msg_text)
                    ping = PingMessage.model_validate(data)
                    reply = EchoMessage(
                        received=ping.model_dump(),
                        server_ts=int(time.time() * 1000),
                    )
                    await out_queue.put(reply.model_dump_json())
                except (json.JSONDecodeError, ValidationError) as exc:
                    await out_queue.put(ErrorMessage(message=str(exc)).model_dump_json())

    except WebSocketDisconnect:
        pass
    finally:
        await asyncio.gather(
            rep_stream.close(), prospect_stream.close(), return_exceptions=True
        )
        sender_task.cancel()
        await asyncio.gather(sender_task, return_exceptions=True)
        logger.info("ws disconnected: %s", client_id)
