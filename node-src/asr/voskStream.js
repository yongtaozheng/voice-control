"use strict";

const { EventEmitter } = require("node:events");
const mic = require("mic");
const vosk = require("vosk");
const { extractConfidence } = require("../utils/confidence");

class VoskMicStream extends EventEmitter {
  constructor({ modelPath, sampleRate = 16000, device = null, blockSizeMs = 200 }) {
    super();
    if (!modelPath) {
      throw new Error("modelPath is required");
    }

    this.sampleRate = Number(sampleRate);
    this.blockSizeMs = Number(blockSizeMs);
    this.model = new vosk.Model(modelPath);
    this.recognizer = new vosk.Recognizer({
      model: this.model,
      sampleRate: this.sampleRate
    });

    this.micInstance = mic({
      rate: String(this.sampleRate),
      channels: "1",
      debug: false,
      fileType: "raw",
      encoding: "signed-integer",
      bitwidth: "16",
      endian: "little",
      device
    });

    this.stream = this.micInstance.getAudioStream();
  }

  start() {
    this.stream.on("data", (chunk) => {
      const accepted = this.recognizer.acceptWaveform(chunk);
      if (accepted) {
        const result = this.recognizer.result();
        const text = (result?.text || "").trim();
        const confidence = extractConfidence(result);
        if (text) {
          this.emit("transcript", { text, confidence });
        }
      }
    });

    this.stream.on("error", (err) => this.emit("error", err));
    this.stream.on("startComplete", () => this.emit("ready"));
    this.stream.on("stopComplete", () => this.emit("stopped"));

    this.micInstance.start();
  }

  stop() {
    try {
      this.micInstance.stop();
    } finally {
      this.recognizer.free();
      this.model.free();
    }
  }
}

module.exports = {
  VoskMicStream
};
