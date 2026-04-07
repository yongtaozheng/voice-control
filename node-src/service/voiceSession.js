"use strict";

const { EventEmitter } = require("node:events");
const { IntentParser, loadPhraseMapFromFile } = require("../core/parser");
const { VoiceControlEngine } = require("../core/engine");

class VoiceSession extends EventEmitter {
  constructor({ asrFactory = null, executorFactory = null } = {}) {
    super();
    this.asrFactory = asrFactory || ((config) => createDefaultAsr(config));
    this.executorFactory = executorFactory || (() => createDefaultExecutor());
    this.asr = null;
    this.running = false;
  }

  start(config) {
    if (this.running) {
      this.log("warn", "语音会话已在运行");
      return;
    }
    if (!config || !config.modelPath) {
      throw new Error("modelPath is required");
    }

    const phraseMap = config.phraseMapFile ? loadPhraseMapFromFile(config.phraseMapFile) : null;
    const parser = new IntentParser({ phraseMap });
    const executor = this.executorFactory();
    const engine = new VoiceControlEngine({
      parser,
      executor,
      wakeWord: config.wakeWord || null
    });

    const confidenceThreshold = normalizeThreshold(config.confidenceThreshold);
    const asr = this.asrFactory({
      modelPath: config.modelPath,
      sampleRate: Number(config.sampleRate) || 16000,
      device: emptyToNull(config.device)
    });

    asr.on("ready", () => {
      this.running = true;
      this.emit("state", { running: true });
      this.log("info", `语音控制已启动，阈值=${confidenceThreshold.toFixed(2)}`);
    });

    asr.on("transcript", ({ text, confidence }) => {
      const conf = Number.isFinite(confidence) ? confidence : 0;
      this.log("heard", `${text} (conf=${conf.toFixed(2)})`);

      if (conf < confidenceThreshold) {
        this.log("skip", "置信度过低，忽略本次指令");
        return;
      }

      const result = engine.handleText(text);
      if (result.handled) {
        this.log("ok", `执行命令: ${result.command} (匹配: ${result.matchedPhrase})`);
      }
    });

    asr.on("error", (err) => {
      this.log("error", `audio/asr: ${err.message || err}`);
    });

    asr.on("stopped", () => {
      this.running = false;
      this.emit("state", { running: false });
      this.log("info", "语音控制已停止");
    });

    this.asr = asr;
    asr.start();
  }

  stop() {
    if (!this.asr) {
      this.running = false;
      this.emit("state", { running: false });
      return;
    }
    const current = this.asr;
    this.asr = null;
    current.stop();
    this.running = false;
    this.emit("state", { running: false });
  }

  log(level, message) {
    this.emit("log", {
      ts: new Date().toISOString(),
      level,
      message
    });
  }
}

function createDefaultAsr(config) {
  const { VoskMicStream } = require("../asr/voskStream");
  return new VoskMicStream(config);
}

function createDefaultExecutor() {
  const { WindowsMediaExecutor } = require("../executors/windowsMediaExecutor");
  return new WindowsMediaExecutor();
}

function normalizeThreshold(value) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return 0.55;
  }
  return threshold;
}

function emptyToNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return value;
}

module.exports = {
  VoiceSession,
  normalizeThreshold
};
