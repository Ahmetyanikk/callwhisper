const btnStart = document.querySelector("#btn-start");
const transcriptLog = document.querySelector("#transcript-log");
const coachingLog = document.querySelector("#coaching-log");

function appendTranscript(text) {
  const line = document.createElement("p");
  line.textContent = text;
  transcriptLog.appendChild(line);
}

function appendCoaching(text) {
  const line = document.createElement("p");
  line.textContent = text;
  coachingLog.prepend(line);
}

function nowHHMMSS() {
  return new Date().toTimeString().slice(0, 8);
}

btnStart.addEventListener("click", () => {
  const ws = new WebSocket("ws://localhost:4000/ws");

  ws.addEventListener("open", () => {
    appendTranscript(`Status: connected at ${nowHHMMSS()}`);
    ws.send(JSON.stringify({ kind: "ping", ts: Date.now() }));
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.kind === "echo") {
      appendCoaching(`Echo received: ${msg.received.ts}`);
    } else if (msg.kind === "error") {
      appendTranscript(`Error: ${msg.message}`);
    }
  });

  ws.addEventListener("close", () => {
    appendTranscript(`Status: disconnected at ${nowHHMMSS()}`);
    btnStart.disabled = false;
    btnStart.textContent = "Start Session";
  });

  ws.addEventListener("error", () => {
    appendTranscript("Status: connection error");
  });

  btnStart.disabled = true;
  btnStart.textContent = "Session Active";
});
