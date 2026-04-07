"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CONFIG = Object.freeze({
  modelPath: "",
  wakeWord: "音乐助手",
  sampleRate: 16000,
  device: "",
  confidenceThreshold: 0.55,
  phraseMapFile: ""
});

function resolveUserDataDir(input = null) {
  const raw = input || process.env.VC_USER_DATA_DIR;
  if (raw && String(raw).trim()) {
    return path.resolve(String(raw).trim());
  }
  return path.join(os.homedir(), ".voice-control-node");
}

function getConfigPath({ userDataDir = null } = {}) {
  const dir = resolveUserDataDir(userDataDir);
  return path.join(dir, "voice-control-config.json");
}

function loadConfig({ userDataDir = null } = {}) {
  const filePath = getConfigPath({ userDataDir });
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizeConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config, { userDataDir = null } = {}) {
  const filePath = getConfigPath({ userDataDir });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const safeConfig = sanitizeConfig(config);
  fs.writeFileSync(filePath, JSON.stringify(safeConfig, null, 2), "utf8");
  return safeConfig;
}

function sanitizeConfig(input) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(isObject(input) ? input : {})
  };

  config.modelPath = String(config.modelPath || "").trim();
  config.wakeWord = String(config.wakeWord || "").trim();
  config.device = String(config.device || "").trim();
  config.phraseMapFile = String(config.phraseMapFile || "").trim();

  const sampleRate = Number(config.sampleRate);
  config.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 16000;

  const threshold = Number(config.confidenceThreshold);
  config.confidenceThreshold =
    Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.55;

  return config;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  DEFAULT_CONFIG,
  getConfigPath,
  loadConfig,
  resolveUserDataDir,
  saveConfig,
  sanitizeConfig
};
