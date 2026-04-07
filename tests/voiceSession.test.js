"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { VoiceSession } = require("../node-src/service/voiceSession");

class FakeAsr extends EventEmitter {
  start() {
    this.emit("ready");
  }

  stop() {
    this.emit("stopped");
  }
}

class FakeExecutor {
  constructor() {
    this.commands = [];
  }

  execute(command) {
    this.commands.push(command);
  }
}

test("voice session ignores low confidence transcript", () => {
  const asr = new FakeAsr();
  const executor = new FakeExecutor();
  const session = new VoiceSession({
    asrFactory: () => asr,
    executorFactory: () => executor
  });

  session.start({
    modelPath: "dummy",
    confidenceThreshold: 0.8
  });

  asr.emit("transcript", { text: "下一首", confidence: 0.4 });

  assert.deepEqual(executor.commands, []);
});

test("voice session executes command above confidence threshold", () => {
  const asr = new FakeAsr();
  const executor = new FakeExecutor();
  const session = new VoiceSession({
    asrFactory: () => asr,
    executorFactory: () => executor
  });

  session.start({
    modelPath: "dummy",
    confidenceThreshold: 0.5
  });

  asr.emit("transcript", { text: "下一首", confidence: 0.9 });

  assert.deepEqual(executor.commands, ["next_track"]);
});
