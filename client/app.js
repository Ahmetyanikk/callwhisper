const WS_URL = "ws://localhost:4000/ws";
const MAX_PENDING_FRAMES = 200;

const btnStart = document.querySelector("#btn-start");
const btnConfirm = document.querySelector("#btn-confirm-devices");
const devicePicker = document.querySelector("#device-picker");
const repSelect = document.querySelector("#rep-select");
const prospectSelect = document.querySelector("#prospect-select");
const transcriptLog = document.querySelector("#transcript-log");
const coachingLog = document.querySelector("#coaching-log");

let ws = null;
const pending = { rep: [], prospect: [] };

// Tracks the in-progress interim element per channel so finals replace them.
const interim = { rep: null, prospect: null };

function appendTranscript(text) {
  const p = document.createElement("p");
  p.textContent = text;
  transcriptLog.appendChild(p);
  transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

function appendCoaching(text) {
  const p = document.createElement("p");
  p.textContent = text;
  coachingLog.prepend(p);
}

function nowHHMMSS() {
  return new Date().toTimeString().slice(0, 8);
}

function renderTranscript(msg) {
  const ch = msg.channel;
  const label = ch === "rep" ? "Rep" : "Prospect";
  const ts = new Date(msg.ts).toTimeString().slice(0, 8);
  const content = `[${ts}] ${label}: ${msg.text}`;

  if (!msg.is_final) {
    if (interim[ch]) {
      interim[ch].textContent = content;
    } else {
      const p = document.createElement("p");
      p.className = `transcript-${ch} transcript-interim`;
      p.textContent = content;
      transcriptLog.appendChild(p);
      interim[ch] = p;
    }
    transcriptLog.scrollTop = transcriptLog.scrollHeight;
  } else {
    if (interim[ch]) {
      interim[ch].remove();
      interim[ch] = null;
    }
    const p = document.createElement("p");
    p.className = `transcript-${ch} transcript-final`;
    p.textContent = content;
    transcriptLog.appendChild(p);
    transcriptLog.scrollTop = transcriptLog.scrollHeight;
  }
}

function flushPending() {
  for (const buf of pending.rep) ws.send(buf);
  pending.rep.length = 0;
  for (const buf of pending.prospect) ws.send(buf);
  pending.prospect.length = 0;
}

function sendFrame(tag, pcmBuffer) {
  const frame = new Uint8Array(1 + pcmBuffer.byteLength);
  frame[0] = tag;
  frame.set(new Uint8Array(pcmBuffer), 1);
  const channel = tag === 0x01 ? "rep" : "prospect";

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pending[channel].push(frame.buffer);
    if (pending[channel].length > MAX_PENDING_FRAMES) {
      pending[channel].shift();
      console.warn(`[callwhisper] buffer overflow on ${channel}, dropping oldest frame`);
    }
    return;
  }
  ws.send(frame.buffer);
}

async function detectDevices() {
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
  probe.getTracks().forEach(t => t.stop());

  const all = await navigator.mediaDevices.enumerateDevices();
  const inputs = all.filter(d => d.kind === "audioinput");
  const repDev = inputs.find(d => d.deviceId === "default") ?? inputs[0];
  const prospectDev = inputs.find(d => /cable output|vb-cable|blackhole/i.test(d.label));
  return { repDev, prospectDev, inputs };
}

function populateSelect(select, devices) {
  select.innerHTML = "";
  for (const d of devices) {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Device ${d.deviceId.slice(0, 6)}`;
    select.appendChild(opt);
  }
}

async function startCapture(repId, prospectId) {
  const constraints = (deviceId) => ({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const [repStream, prospectStream] = await Promise.all([
    navigator.mediaDevices.getUserMedia(constraints(repId)),
    navigator.mediaDevices.getUserMedia(constraints(prospectId)),
  ]);

  for (const [stream, tag] of [[repStream, 0x01], [prospectStream, 0x02]]) {
    const label = tag === 0x01 ? "Rep" : "Prospect";
    const ctx = new AudioContext();
    try {
      await ctx.audioWorklet.addModule("processor.js");
    } catch (err) {
      appendTranscript(`Error: AudioWorklet failed to load — ${err.message}`);
      appendTranscript("Debug: ensure page served over HTTP (not file://), check DevTools console");
      return;
    }
    const node = new AudioWorkletNode(ctx, "pcm-processor");
    ctx.createMediaStreamSource(stream).connect(node);
    node.port.onmessage = (e) => sendFrame(tag, e.data);
    appendTranscript(`${label}: capturing at ${ctx.sampleRate}Hz`);
  }
}

function openWebSocket() {
  ws = new WebSocket(WS_URL);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    flushPending();
    appendTranscript(`Status: connected at ${nowHHMMSS()}`);
    ws.send(JSON.stringify({ kind: "ping", ts: Date.now() }));
  });

  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const msg = JSON.parse(event.data);
    if (msg.kind === "transcript") {
      renderTranscript(msg);
    } else if (msg.kind === "echo") {
      appendTranscript(`Status: server echo ok at ${nowHHMMSS()}`);
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
}

btnStart.addEventListener("click", async () => {
  btnStart.disabled = true;
  btnStart.textContent = "Session Active";
  openWebSocket();

  try {
    const { repDev, prospectDev, inputs } = await detectDevices();
    if (prospectDev) {
      await startCapture(repDev.deviceId, prospectDev.deviceId);
    } else {
      appendTranscript("VB-Cable / BlackHole not found — select devices manually");
      populateSelect(repSelect, inputs);
      populateSelect(prospectSelect, inputs);
      devicePicker.hidden = false;
    }
  } catch (err) {
    appendTranscript(`Error: ${err.message}`);
  }
});

btnConfirm.addEventListener("click", async () => {
  devicePicker.hidden = true;
  try {
    await startCapture(repSelect.value, prospectSelect.value);
  } catch (err) {
    appendTranscript(`Error: ${err.message}`);
  }
});
