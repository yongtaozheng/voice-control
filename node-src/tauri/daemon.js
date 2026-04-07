"use strict";

const readline = require("node:readline");
const { VoiceSession } = require("../service/voiceSession");
const {
  loadConfig,
  resolveUserDataDir,
  saveConfig,
  sanitizeConfig
} = require("./configStore");

const LOG_LIMIT = 300;

const userDataDir = resolveUserDataDir();
let config = loadConfig({ userDataDir });
const logBuffer = [];
const session = new VoiceSession();

session.on("log", (item) => {
  pushLog(item);
});

session.on("state", (state) => {
  emitEvent("vc:state", state);
});

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  await handleMessage(message);
});

rl.on("close", () => {
  try {
    session.stop();
  } finally {
    process.exit(0);
  }
});

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

pushLog({
  ts: new Date().toISOString(),
  level: "info",
  message: `Tauri daemon ready (data dir: ${userDataDir})`
});

async function handleMessage(message) {
  const id = Number(message.id);
  const cmd = String(message.cmd || "");
  const payload = message.payload;

  if (!Number.isFinite(id)) {
    return;
  }

  try {
    if (cmd === "get_state") {
      respondOk(id, getState());
      return;
    }

    if (cmd === "save_config") {
      config = saveConfig(sanitizeConfig(payload), { userDataDir });
      respondOk(id, {
        running: session.running,
        config
      });
      return;
    }

    if (cmd === "start") {
      try {
        session.start(config);
      } catch (err) {
        pushLog({
          ts: new Date().toISOString(),
          level: "error",
          message: err.message || String(err)
        });
      }
      respondOk(id, {
        running: session.running,
        config
      });
      return;
    }

    if (cmd === "stop") {
      session.stop();
      respondOk(id, {
        running: session.running,
        config
      });
      return;
    }

    if (cmd === "shutdown") {
      session.stop();
      respondOk(id, { ok: true });
      setImmediate(() => shutdown());
      return;
    }

    respondErr(id, `Unknown command: ${cmd}`);
  } catch (err) {
    respondErr(id, err.message || String(err));
  }
}

function getState() {
  return {
    running: session.running,
    config,
    logs: [...logBuffer]
  };
}

function pushLog(item) {
  logBuffer.push(item);
  if (logBuffer.length > LOG_LIMIT) {
    logBuffer.shift();
  }
  emitEvent("vc:log", item);
}

function emitEvent(name, payload) {
  writeMessage({
    type: "event",
    name,
    payload
  });
}

function respondOk(id, data) {
  writeMessage({
    type: "response",
    id,
    ok: true,
    data
  });
}

function respondErr(id, error) {
  writeMessage({
    type: "response",
    id,
    ok: false,
    error
  });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function shutdown() {
  try {
    session.stop();
  } finally {
    process.exit(0);
  }
}
