const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("viewerAPI", {
  getPartnerInfo: () => ipcRenderer.invoke("viewer-get-partner-info"),
  sendSignal: (signal) => ipcRenderer.invoke("viewer-send-signal", signal),
  sendInput: (cmd) => ipcRenderer.invoke("viewer-send-input", cmd),
  toggleFullscreen: () => ipcRenderer.invoke("viewer-toggle-fullscreen"),
  endSession: () => ipcRenderer.invoke("viewer-end-session"),
  on: (channel, callback) => {
    const valid = ["viewer-signal", "viewer-status", "viewer-partner-info"];
    if (valid.includes(channel)) {
      const handler = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
});
