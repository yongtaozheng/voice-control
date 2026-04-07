"use strict";

function extractConfidence(result) {
  if (!result || !Array.isArray(result.result) || result.result.length === 0) {
    return 0;
  }
  const values = result.result
    .map((item) => Number(item.conf))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

module.exports = {
  extractConfidence
};
