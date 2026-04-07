"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceControlApi", {
  getState: () => ipcRenderer.invoke("vc:get-state"),
  saveConfig: (config) => ipcRenderer.invoke("vc:save-config", config),
  start: () => ipcRenderer.invoke("vc:start"),
  stop: () => ipcRenderer.invoke("vc:stop"),
  onLog: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("vc:log", wrapped);
    return () => ipcRenderer.removeListener("vc:log", wrapped);
  },
  onState: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("vc:state", wrapped);
    return () => ipcRenderer.removeListener("vc:state", wrapped);
  }
});
