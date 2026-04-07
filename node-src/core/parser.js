"use strict";

const fs = require("node:fs");
const path = require("node:path");

const COMMANDS = Object.freeze({
  PLAY_PAUSE: "play_pause",
  NEXT_TRACK: "next_track",
  PREV_TRACK: "prev_track",
  STOP: "stop",
  VOLUME_UP: "volume_up",
  VOLUME_DOWN: "volume_down",
  VOLUME_MUTE: "volume_mute"
});

const DEFAULT_PHRASE_MAP = Object.freeze({
  [COMMANDS.PLAY_PAUSE]: ["播放", "暂停", "继续", "播放暂停"],
  [COMMANDS.NEXT_TRACK]: ["下一首", "下首", "切下一首", "下一曲"],
  [COMMANDS.PREV_TRACK]: ["上一首", "上首", "切上一首", "上一曲"],
  [COMMANDS.STOP]: ["停止音乐", "停止播放", "停止"],
  [COMMANDS.VOLUME_UP]: ["调大音量", "音量加", "音量增大", "大声一点"],
  [COMMANDS.VOLUME_DOWN]: ["调小音量", "音量减", "音量减小", "小声一点"],
  [COMMANDS.VOLUME_MUTE]: ["静音", "取消声音", "闭麦"]
});

const COMMAND_VALUES = Object.values(COMMANDS);

function normalize(text) {
  if (!text) return "";
  return String(text).trim().toLowerCase().replace(/\s+/g, "");
}

class IntentParser {
  constructor({ phraseMap = null } = {}) {
    this.phraseMap = mergePhraseMap(phraseMap);
    this.phraseEntries = COMMAND_VALUES.map((command) => [command, this.phraseMap[command]]);
  }

  parse(text) {
    const normalized = normalize(text);
    if (!normalized) {
      return null;
    }

    for (const [command, phrases] of this.phraseEntries) {
      for (const phrase of phrases) {
        if (normalized.includes(phrase)) {
          return { command, matchedPhrase: phrase };
        }
      }
    }

    return null;
  }
}

function cloneDefaultPhraseMap() {
  const map = {};
  for (const command of COMMAND_VALUES) {
    map[command] = [...DEFAULT_PHRASE_MAP[command]];
  }
  return map;
}

function mergePhraseMap(overrideMap) {
  const merged = cloneDefaultPhraseMap();
  if (!overrideMap) {
    return merged;
  }
  if (!isPlainObject(overrideMap)) {
    throw new Error("phrase map must be an object");
  }

  for (const [command, phrases] of Object.entries(overrideMap)) {
    if (!COMMAND_VALUES.includes(command)) {
      throw new Error(`unknown command in phrase map: ${command}`);
    }
    if (!Array.isArray(phrases)) {
      throw new Error(`phrases for command ${command} must be an array`);
    }

    const normalizedPhrases = phrases
      .map((item) => normalize(item))
      .filter((item) => item.length > 0);

    if (normalizedPhrases.length === 0) {
      throw new Error(`phrases for command ${command} cannot be empty`);
    }

    merged[command] = normalizedPhrases;
  }
  return merged;
}

function loadPhraseMapFromFile(filePath) {
  if (!filePath) {
    throw new Error("filePath is required");
  }
  const resolvedPath = path.resolve(filePath);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  return mergePhraseMap(parsed);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  COMMANDS,
  DEFAULT_PHRASE_MAP,
  IntentParser,
  loadPhraseMapFromFile,
  mergePhraseMap,
  normalize
};
