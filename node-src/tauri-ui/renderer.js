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
  const tauriApi = ensureTauriApi();
  const state = await tauriApi.invoke("vc_get_state");
  setForm(state.config || {});
  setRunning(Boolean(state.running));

  if (Array.isArray(state.logs)) {
    for (const item of state.logs) {
      appendLog(item);
    }
  }

  await tauriApi.listen("vc:log", (event) => {
    appendLog(event.payload || {});
  });

  await tauriApi.listen("vc:state", (event) => {
    const payload = event.payload || {};
    if (typeof payload.running === "boolean") {
      setRunning(payload.running);
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
  const tauriApi = ensureTauriApi();
  await saveConfig();
  const state = await tauriApi.invoke("vc_start");
  setRunning(Boolean(state.running));
});

stopBtn.addEventListener("click", async () => {
  const tauriApi = ensureTauriApi();
  const state = await tauriApi.invoke("vc_stop");
  setRunning(Boolean(state.running));
});

async function saveConfig() {
  const tauriApi = ensureTauriApi();
  const payload = readForm();
  const state = await tauriApi.invoke("vc_save_config", { payload });
  setForm(state.config || {});
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

function ensureTauriApi() {
  const globalTauri = window.__TAURI__;
  if (!globalTauri || !globalTauri.tauri || !globalTauri.event) {
    throw new Error("Tauri API 不可用，请通过 Tauri 容器启动应用。");
  }

  return {
    invoke: globalTauri.tauri.invoke,
    listen: globalTauri.event.listen
  };
}
