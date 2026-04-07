"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } = require("electron");
const { VoiceSession } = require("../service/voiceSession");
const { loadConfig, saveConfig, sanitizeConfig } = require("./configStore");

const LOG_LIMIT = 300;

let mainWindow = null;
let tray = null;
let config = null;
const logBuffer = [];
const session = new VoiceSession();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = buildTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Voice Control Desktop");
  tray.on("double-click", () => {
    showWindow();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }
  const running = session.running;
  const menu = Menu.buildFromTemplate([
    { label: "打开面板", click: () => showWindow() },
    { type: "separator" },
    { label: "启动监听", enabled: !running, click: () => startSession() },
    { label: "停止监听", enabled: running, click: () => stopSession() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.isQuitting = true;
        stopSession();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

function startSession() {
  try {
    session.start(config);
  } catch (err) {
    pushLog({
      ts: new Date().toISOString(),
      level: "error",
      message: err.message || String(err)
    });
  }
  updateTrayMenu();
}

function stopSession() {
  session.stop();
  updateTrayMenu();
}

function pushLog(item) {
  logBuffer.push(item);
  if (logBuffer.length > LOG_LIMIT) {
    logBuffer.shift();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("vc:log", item);
  }
}

function broadcastState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("vc:state", state);
  }
}

function registerIpcHandlers() {
  ipcMain.handle("vc:get-state", () => ({
    running: session.running,
    config,
    logs: [...logBuffer]
  }));

  ipcMain.handle("vc:save-config", (_event, nextConfig) => {
    config = saveConfig(app, sanitizeConfig(nextConfig));
    return { running: session.running, config };
  });

  ipcMain.handle("vc:start", () => {
    startSession();
    return { running: session.running, config };
  });

  ipcMain.handle("vc:stop", () => {
    stopSession();
    return { running: session.running, config };
  });
}

function buildTrayIcon() {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAz0lEQVR42mNgGAWjgP///38GJgYGBgaG/xkYGP4zMDAwMDD8Z2Bg+M/AwMDwHz4wMDD8T8DAwPBfBgYGhk8MDAwMvxkYGNi+MDAw/N/AwMDwv4GBgWEgAwMDw4cGBgaG/2f4//8fQb7z58//P2fOnPnPwMDA8P///8+fP3/+/Pn/HxkYGPhvYGBg+M/AwMDwHwcGBob/HxgYGP7z8PDw/w8MDAz/GRgY/s/AwPDfAQMDA8N/BgYGhP8MDAwM/0f4j4GBgWEAAO9NEkX6t84QAAAAAElFTkSuQmCC";
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
  return icon.resize({ width: 16, height: 16 });
}

session.on("log", (item) => {
  pushLog(item);
});

session.on("state", (state) => {
  broadcastState(state);
  updateTrayMenu();
});

app.on("ready", () => {
  config = loadConfig(app);
  registerIpcHandlers();
  createWindow();
  createTray();
  pushLog({
    ts: new Date().toISOString(),
    level: "info",
    message: "应用已启动，可在托盘控制监听。"
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  stopSession();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("activate", () => {
  showWindow();
});
