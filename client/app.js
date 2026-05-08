const WS_URL = "ws://localhost:4000/ws";
const MAX_PENDING_FRAMES = 200;

const btnToggle = document.querySelector("#btn-toggle");
const btnTestRep = document.querySelector("#btn-test-rep");
const btnTestProspect = document.querySelector("#btn-test-prospect");
const repSelect = document.querySelector("#rep-select");
const prospectSelect = document.querySelector("#prospect-select");
const repRmsEl = document.querySelector("#rep-rms");
const prospectRmsEl = document.querySelector("#prospect-rms");
const statusIndicator = document.querySelector("#status-indicator");
const transcriptLog = document.querySelector("#transcript-log");
const coachingLog = document.querySelector("#coaching-log");
const transcriptPlaceholder = document.querySelector("#transcript-placeholder");
const coachingPlaceholder = document.querySelector("#coaching-placeholder");
const prospectWarnEl = document.querySelector("#prospect-warn");
const toastEl = document.querySelector("#toast");

let ws = null;
let sessionActive = false;
let repStream = null;
let prospectStream = null;
let repCtx = null;
let prospectCtx = null;
let repNode = null;
let prospectNode = null;
const pending = { rep: [], prospect: [] };
const interim = { rep: null, prospect: null };

function setStatus(state) {
  const labels = { idle: "Idle", connecting: "Connecting…", live: "Live", disconnected: "Disconnected" };
  statusIndicator.className = `status-${state}`;
  statusIndicator.textContent = labels[state] ?? "Idle";
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
}

function hideToast() {
  toastEl.classList.add("hidden");
}

function appendTranscript(text) {
  transcriptPlaceholder.classList.add("hidden");
  const p = document.createElement("p");
  p.textContent = text;
  transcriptLog.appendChild(p);
  transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

function renderSuggestion(msg) {
  coachingPlaceholder.classList.add("hidden");
  const card = document.createElement("div");
  card.className = "suggestion-card";

  const ts = document.createElement("span");
  ts.className = "suggest-ts";
  ts.textContent = `[${new Date(msg.ts).toTimeString().slice(0, 8)}]`;
  card.appendChild(ts);

  const fields = [
    { key: "say_this",  cls: "suggest-say",   label: "💬 Say this" },
    { key: "ask_this",  cls: "suggest-ask",   label: "❓ Ask this" },
    { key: "watch_out", cls: "suggest-watch", label: "⚠️ Watch out" },
  ];
  for (const { key, cls, label } of fields) {
    if (!msg[key]) continue;
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = `${label}: ${msg[key]}`;
    card.appendChild(p);
  }

  coachingLog.prepend(card);
  while (coachingLog.children.length > 10) coachingLog.lastChild.remove();
}

function nowHHMMSS() {
  return new Date().toTimeString().slice(0, 8);
}

function renderTranscript(msg) {
  transcriptPlaceholder.classList.add("hidden");
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

function populateSelect(select, devices) {
  select.innerHTML = "";
  for (const d of devices) {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Device ${d.deviceId.slice(0, 6)}`;
    select.appendChild(opt);
  }
}

async function initDevices() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop());
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all.filter(d => d.kind === "audioinput");
    populateSelect(repSelect, inputs);
    populateSelect(prospectSelect, inputs);

    const repDev = inputs.find(d => /default|hyperx|fifine/i.test(d.label))
                ?? inputs.find(d => d.deviceId === "default")
                ?? inputs[0];
    if (repDev) repSelect.value = repDev.deviceId;

    const prospectDev = inputs.find(d => /cable output/i.test(d.label));
    if (prospectDev) {
      prospectSelect.value = prospectDev.deviceId;
    } else {
      prospectWarnEl.textContent = "No virtual audio device detected";
    }
  } catch (err) {
    appendTranscript(`Error enumerating devices: ${err.message}`);
  }
}

async function testChannel(deviceId, resultEl) {
  if (sessionActive) { resultEl.textContent = "stop session first"; return; }
  resultEl.textContent = "testing 3s...";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    resultEl.textContent = `err: ${err.message}`;
    return;
  }
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
    analyser.getFloatTimeDomainData(buf);
    let ss = 0;
    for (const s of buf) ss += s * s;
    const rms = Math.sqrt(ss / buf.length);
    if (rms > peak) peak = rms;
  }
  resultEl.textContent = `peak RMS: ${peak.toFixed(4)}`;
  stream.getTracks().forEach(t => t.stop());
  await ctx.close();
}

async function startCapture() {
  const constraints = (deviceId) => ({
    audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  [repStream, prospectStream] = await Promise.all([
    navigator.mediaDevices.getUserMedia(constraints(repSelect.value)),
    navigator.mediaDevices.getUserMedia(constraints(prospectSelect.value)),
  ]);
  for (const [stream, tag] of [[repStream, 0x01], [prospectStream, 0x02]]) {
    const ctx = new AudioContext();
    if (tag === 0x01) repCtx = ctx; else prospectCtx = ctx;
    try {
      await ctx.audioWorklet.addModule("processor.js");
    } catch (err) {
      appendTranscript(`Error: AudioWorklet failed to load — ${err.message}`);
      appendTranscript("Debug: ensure page served over HTTP (not file://), check DevTools console");
      throw err;
    }
    const node = new AudioWorkletNode(ctx, "pcm-processor");
    if (tag === 0x01) repNode = node; else prospectNode = node;
    ctx.createMediaStreamSource(stream).connect(node);
    node.port.onmessage = (e) => sendFrame(tag, e.data);
    appendTranscript(`${tag === 0x01 ? "Rep" : "Prospect"}: capturing at ${ctx.sampleRate}Hz`);
  }
}

function openWebSocket() {
  ws = new WebSocket(WS_URL);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    flushPending();
    setStatus("live");
    appendTranscript(`Status: connected at ${nowHHMMSS()}`);
    ws.send(JSON.stringify({ kind: "ping", ts: Date.now() }));
  });

  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const msg = JSON.parse(event.data);
    if (msg.kind === "transcript") {
      renderTranscript(msg);
    } else if (msg.kind === "suggestion") {
      renderSuggestion(msg);
    } else if (msg.kind === "echo") {
      appendTranscript(`Status: server echo ok at ${nowHHMMSS()}`);
    } else if (msg.kind === "error") {
      appendTranscript(`Error: ${msg.message}`);
    }
  });

  ws.addEventListener("close", () => {
    // sessionActive=false means we closed intentionally via stopSession — no toast needed
    if (sessionActive) {
      setStatus("disconnected");
      showToast("Connection lost. Click Stop to reset.");
      ws = null;
    }
  });

  ws.addEventListener("error", () => {
    appendTranscript("Status: connection error");
  });
}

async function stopSession() {
  sessionActive = false;
  hideToast();

  if (ws) { ws.close(); ws = null; }

  for (const stream of [repStream, prospectStream]) {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }
  repStream = null;
  prospectStream = null;

  if (repNode) { repNode.disconnect(); repNode = null; }
  if (prospectNode) { prospectNode.disconnect(); prospectNode = null; }

  for (const ctx of [repCtx, prospectCtx]) {
    if (ctx && ctx.state !== "closed") await ctx.close();
  }
  repCtx = null;
  prospectCtx = null;

  pending.rep.length = 0;
  pending.prospect.length = 0;
  interim.rep = null;
  interim.prospect = null;

  transcriptLog.innerHTML = "";
  coachingLog.innerHTML = "";
  transcriptLog.appendChild(transcriptPlaceholder);
  coachingLog.appendChild(coachingPlaceholder);
  transcriptPlaceholder.classList.remove("hidden");
  coachingPlaceholder.classList.remove("hidden");

  setStatus("idle");
  btnToggle.textContent = "Start Session";
  btnToggle.disabled = false;
}

async function startSession() {
  btnToggle.disabled = true;
  setStatus("connecting");
  openWebSocket();
  try {
    await startCapture();
    sessionActive = true;
    btnToggle.textContent = "Stop Session";
    btnToggle.disabled = false;
  } catch (err) {
    await stopSession();
    appendTranscript(`Error starting session: ${err.message}`);
  }
}

btnToggle.addEventListener("click", () => {
  if (!sessionActive) startSession();
  else stopSession();
});

btnTestRep.addEventListener("click", () => testChannel(repSelect.value, repRmsEl));
btnTestProspect.addEventListener("click", () => testChannel(prospectSelect.value, prospectRmsEl));

initDevices();
