from typing import Any, Literal

from pydantic import BaseModel


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


class TranscriptMessage(BaseModel):
    kind: Literal["transcript"] = "transcript"
    channel: Literal["rep", "prospect"]
    text: str
    is_final: bool
    ts: int       # server wall-clock ms
    start_ms: int  # Deepgram word-start offset ms


class SuggestionMessage(BaseModel):
    kind: Literal["suggestion"] = "suggestion"
    say_this: str | None = None
    ask_this: str | None = None
    watch_out: str | None = None
    ts: int
