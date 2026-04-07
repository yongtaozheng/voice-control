"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractConfidence } = require("../node-src/utils/confidence");

test("extractConfidence averages token conf", () => {
  const confidence = extractConfidence({
    result: [{ conf: 0.8 }, { conf: 0.6 }, { conf: 1.0 }]
  });
  assert.ok(Math.abs(confidence - 0.8) < 1e-9);
});

test("extractConfidence returns 0 when no conf data", () => {
  assert.equal(extractConfidence({ result: [] }), 0);
  assert.equal(extractConfidence({}), 0);
  assert.equal(extractConfidence(null), 0);
});
