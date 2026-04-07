"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { COMMANDS } = require("../core/parser");

const VK = Object.freeze({
  [COMMANDS.NEXT_TRACK]: 0xB0,
  [COMMANDS.PREV_TRACK]: 0xB1,
  [COMMANDS.STOP]: 0xB2,
  [COMMANDS.PLAY_PAUSE]: 0xB3,
  [COMMANDS.VOLUME_MUTE]: 0xAD,
  [COMMANDS.VOLUME_DOWN]: 0xAE,
  [COMMANDS.VOLUME_UP]: 0xAF
});

class WindowsMediaExecutor {
  constructor() {
    if (process.platform !== "win32") {
      throw new Error("WindowsMediaExecutor only supports win32");
    }
    this.scriptPath = path.resolve(__dirname, "../../scripts/send-media-key.ps1");
  }

  execute(command) {
    const vkCode = VK[command];
    if (!vkCode) {
      throw new Error(`Unsupported command: ${command}`);
    }

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        this.scriptPath,
        "-Vk",
        String(vkCode)
      ],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `Send media key failed (code=${result.status}): ${result.stderr || result.stdout}`
      );
    }
  }
}

module.exports = {
  WindowsMediaExecutor
};
