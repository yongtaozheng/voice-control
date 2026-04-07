"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { IntentParser, COMMANDS } = require("../node-src/core/parser");
const { VoiceControlEngine } = require("../node-src/core/engine");

class FakeExecutor {
  constructor() {
    this.executed = [];
  }

  execute(command) {
    this.executed.push(command);
  }
}

test("engine executes command", () => {
  const executor = new FakeExecutor();
  const engine = new VoiceControlEngine({ parser: new IntentParser(), executor });
  const result = engine.handleText("下一首");

  assert.equal(result.handled, true);
  assert.deepEqual(executor.executed, [COMMANDS.NEXT_TRACK]);
});

test("engine requires wake word when configured", () => {
  const executor = new FakeExecutor();
  const engine = new VoiceControlEngine({
    parser: new IntentParser(),
    executor,
    wakeWord: "音乐助手"
  });

  const miss = engine.handleText("下一首");
  const hit = engine.handleText("音乐助手 下一首");

  assert.equal(miss.handled, false);
  assert.equal(hit.handled, true);
  assert.deepEqual(executor.executed, [COMMANDS.NEXT_TRACK]);
});
