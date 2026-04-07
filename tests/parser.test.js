"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { IntentParser, COMMANDS, mergePhraseMap } = require("../node-src/core/parser");

test("parse play/pause", () => {
  const parser = new IntentParser();
  const result = parser.parse("请帮我暂停一下");
  assert.ok(result);
  assert.equal(result.command, COMMANDS.PLAY_PAUSE);
});

test("parse next track", () => {
  const parser = new IntentParser();
  const result = parser.parse("切下一首歌");
  assert.ok(result);
  assert.equal(result.command, COMMANDS.NEXT_TRACK);
});

test("parse unknown", () => {
  const parser = new IntentParser();
  const result = parser.parse("今天天气怎么样");
  assert.equal(result, null);
});

test("custom phrase map overrides defaults for command", () => {
  const phraseMap = mergePhraseMap({
    [COMMANDS.NEXT_TRACK]: ["切歌"]
  });
  const parser = new IntentParser({ phraseMap });

  const hit = parser.parse("帮我切歌");
  const miss = parser.parse("下一首");

  assert.ok(hit);
  assert.equal(hit.command, COMMANDS.NEXT_TRACK);
  assert.equal(miss, null);
});
