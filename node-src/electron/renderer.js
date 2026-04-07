"use strict";

const form = document.getElementById("settings-form");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const saveBtn = document.getElementById("save-btn");
const statusEl = document.getElementById("status");
const logsEl = document.getElementById("logs");

const fields = {
  modelPath: document.getElementById("modelPath"),
  wakeWord: document.getElementById("wakeWord"),
  sampleRate: document.getElementById("sampleRate"),
  device: document.getElementById("device"),
  confidenceThreshold: document.getElementById("confidenceThreshold"),
  phraseMapFile: document.getElementById("phraseMapFile")
};

init().catch((err) => appendLog({ level: "error", message: err.message || String(err) }));

async function init() {
  const state = await window.voiceControlApi.getState();
  setForm(state.config);
  setRunning(state.running);
  if (Array.isArray(state.logs)) {
    for (const item of state.logs) {
      appendLog(item);
    }
  }

  window.voiceControlApi.onLog((item) => {
    appendLog(item);
  });

  window.voiceControlApi.onState((statePayload) => {
    if (typeof statePayload.running === "boolean") {
      setRunning(statePayload.running);
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveConfig();
});

saveBtn.addEventListener("click", async () => {
  await saveConfig();
});

startBtn.addEventListener("click", async () => {
  await saveConfig();
  const state = await window.voiceControlApi.start();
  setRunning(state.running);
});

stopBtn.addEventListener("click", async () => {
  const state = await window.voiceControlApi.stop();
  setRunning(state.running);
});

async function saveConfig() {
  const payload = readForm();
  const state = await window.voiceControlApi.saveConfig(payload);
  setForm(state.config);
  appendLog({ level: "info", message: "配置已保存" });
}

function readForm() {
  return {
    modelPath: fields.modelPath.value,
    wakeWord: fields.wakeWord.value,
    sampleRate: Number(fields.sampleRate.value),
    device: fields.device.value,
    confidenceThreshold: Number(fields.confidenceThreshold.value),
    phraseMapFile: fields.phraseMapFile.value
  };
}

function setForm(config) {
  fields.modelPath.value = config.modelPath || "";
  fields.wakeWord.value = config.wakeWord || "";
  fields.sampleRate.value = String(config.sampleRate || 16000);
  fields.device.value = config.device || "";
  fields.confidenceThreshold.value = String(config.confidenceThreshold ?? 0.55);
  fields.phraseMapFile.value = config.phraseMapFile || "";
}

function setRunning(running) {
  statusEl.textContent = running ? "运行中" : "已停止";
  statusEl.className = running ? "status running" : "status stopped";
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function appendLog(item) {
  const line = document.createElement("div");
  line.className = `log ${item.level || "info"}`;
  const ts = item.ts ? new Date(item.ts).toLocaleTimeString() : new Date().toLocaleTimeString();
  line.textContent = `[${ts}] [${item.level || "info"}] ${item.message || ""}`;
  logsEl.prepend(line);
}
