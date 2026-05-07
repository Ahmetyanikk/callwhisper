"""
CallWhisper server — Session 1 scaffold.
FastAPI app with health check and WebSocket echo endpoint.
"""

import itertools
import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("callwhisper")

_client_ids = itertools.count(1)


class PingMessage(BaseModel):
    kind: Literal["ping"]
    ts: int


class EchoMessage(BaseModel):
    kind: Literal["echo"] = "echo"
    received: dict[str, Any]
    server_ts: int


class ErrorMessage(BaseModel):
    kind: Literal["error"] = "error"
    message: str


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

    try:
        while True:
            raw = await websocket.receive_text()
            logger.info("ws received: %s", raw)

            try:
                data = json.loads(raw)
                msg = PingMessage.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as exc:
                await websocket.send_text(
                    ErrorMessage(message=str(exc)).model_dump_json()
                )
                continue

            reply = EchoMessage(
                received=msg.model_dump(),
                server_ts=int(time.time() * 1000),
            )
            await websocket.send_text(reply.model_dump_json())

    except WebSocketDisconnect:
        logger.info("ws disconnected: %s", client_id)
