"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeConfig } = require("../node-src/tauri/configStore");

test("sanitizeConfig applies defaults and trims strings", () => {
  const config = sanitizeConfig({
    modelPath: "  C:\\models\\cn  ",
    wakeWord: "  音乐助手 ",
    sampleRate: "16000",
    device: "  设备1 ",
    confidenceThreshold: "0.6",
    phraseMapFile: " config/phrases.json "
  });

  assert.equal(config.modelPath, "C:\\models\\cn");
  assert.equal(config.wakeWord, "音乐助手");
  assert.equal(config.sampleRate, 16000);
  assert.equal(config.device, "设备1");
  assert.equal(config.confidenceThreshold, 0.6);
  assert.equal(config.phraseMapFile, "config/phrases.json");
});

test("sanitizeConfig clamps invalid numbers to defaults", () => {
  const config = sanitizeConfig({
    sampleRate: -1,
    confidenceThreshold: 9
  });

  assert.equal(config.sampleRate, 16000);
  assert.equal(config.confidenceThreshold, 0.55);
});
