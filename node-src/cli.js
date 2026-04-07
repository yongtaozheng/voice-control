"use strict";

const { VoiceSession, normalizeThreshold } = require("./service/voiceSession");

function parseArgs(argv) {
  const options = {
    modelPath: null,
    wakeWord: null,
    sampleRate: 16000,
    device: null,
    confidenceThreshold: 0.55,
    phraseMapFile: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--model-path") {
      options.modelPath = next;
      i += 1;
    } else if (arg === "--wake-word") {
      options.wakeWord = next;
      i += 1;
    } else if (arg === "--sample-rate") {
      options.sampleRate = Number(next);
      i += 1;
    } else if (arg === "--device") {
      options.device = next;
      i += 1;
    } else if (arg === "--confidence-threshold") {
      options.confidenceThreshold = Number(next);
      i += 1;
    } else if (arg === "--phrase-map-file") {
      options.phraseMapFile = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    }
  }

  if (!options.modelPath) {
    printUsageAndExit(1, "Missing required --model-path");
  }
  if (
    !Number.isFinite(options.confidenceThreshold) ||
    options.confidenceThreshold < 0 ||
    options.confidenceThreshold > 1
  ) {
    printUsageAndExit(1, "Invalid --confidence-threshold, must be between 0 and 1");
  }

  return options;
}

function printUsageAndExit(code, message = null) {
  if (message) {
    console.error(`[error] ${message}`);
  }
  console.log(
    [
      "Usage:",
      "  node node-src/cli.js --model-path <path> [--wake-word 音乐助手] [--sample-rate 16000] [--device <device>] [--confidence-threshold 0.55] [--phrase-map-file config/phrases.json]"
    ].join("\n")
  );
  process.exit(code);
}

function main() {
  if (process.platform !== "win32") {
    throw new Error("当前 Node MVP 仅实现 Windows 媒体键执行。");
  }

  const options = parseArgs(process.argv);
  const session = new VoiceSession();
  const threshold = normalizeThreshold(options.confidenceThreshold);

  session.on("log", (item) => {
    console.log(`[${item.level}] ${item.message}`);
  });

  process.on("SIGINT", () => {
    session.stop();
    console.log("[info] 已退出");
    process.exit(0);
  });

  session.start({
    modelPath: options.modelPath,
    wakeWord: options.wakeWord,
    sampleRate: options.sampleRate,
    device: options.device,
    confidenceThreshold: threshold,
    phraseMapFile: options.phraseMapFile
  });
}

if (require.main === module) {
  main();
}
