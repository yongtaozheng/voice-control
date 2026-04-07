"use strict";

const { normalize } = require("./parser");

class VoiceControlEngine {
  constructor({ parser, executor, wakeWord = null }) {
    if (!parser) {
      throw new Error("parser is required");
    }
    if (!executor) {
      throw new Error("executor is required");
    }
    this.parser = parser;
    this.executor = executor;
    this.wakeWord = wakeWord;
  }

  handleText(rawText) {
    let normalized = normalize(rawText);
    if (!normalized) {
      return { handled: false, reason: "empty" };
    }

    if (this.wakeWord) {
      const wake = normalize(this.wakeWord);
      if (!normalized.includes(wake)) {
        return { handled: false, reason: "wake_word_missing" };
      }
      normalized = normalized.replace(wake, "");
      if (!normalized) {
        return { handled: false, reason: "empty_after_wake" };
      }
    }

    const parsed = this.parser.parse(normalized);
    if (!parsed) {
      return { handled: false, reason: "unmatched" };
    }

    this.executor.execute(parsed.command);
    return {
      handled: true,
      command: parsed.command,
      matchedPhrase: parsed.matchedPhrase
    };
  }
}

module.exports = {
  VoiceControlEngine
};
