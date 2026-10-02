const { contextBridge, ipcRenderer } = require("electron");

const listeners = {};
const queuedMessages = {};

const VALID_CHANNELS = ["viewer-signal", "viewer-status", "viewer-partner-info"];

// Eagerly attach listeners to buffer incoming messages even before the DOM attaches handlers
for (const ch of VALID_CHANNELS) {
  ipcRenderer.on(ch, (_event, ...args) => {
    if (listeners[ch] && listeners[ch].length > 0) {
      for (const cb of listeners[ch]) {
        try {
          cb(...args);
        } catch (e) {
          console.error(`[PreloadViewer] Error in ${ch} listener:`, e);
        }
      }
    } else {
      if (!queuedMessages[ch]) queuedMessages[ch] = [];
      queuedMessages[ch].push(args);
    }
  });
}

contextBridge.exposeInMainWorld("viewerAPI", {
  getPartnerInfo: () => ipcRenderer.invoke("viewer-get-partner-info"),
  sendSignal: (signal) => ipcRenderer.invoke("viewer-send-signal", signal),
  sendInput: (cmd) => ipcRenderer.invoke("viewer-send-input", cmd),
  toggleFullscreen: () => ipcRenderer.invoke("viewer-toggle-fullscreen"),
  endSession: () => ipcRenderer.invoke("viewer-end-session"),
  on: (channel, callback) => {
    if (!VALID_CHANNELS.includes(channel) || typeof callback !== "function") {
      return () => {};
    }

    if (!listeners[channel]) listeners[channel] = [];
    listeners[channel].push(callback);

    // Flush any messages that arrived before this callback was attached
    if (queuedMessages[channel] && queuedMessages[channel].length > 0) {
      const pending = queuedMessages[channel].slice();
      queuedMessages[channel] = [];
      for (const args of pending) {
        try {
          callback(...args);
        } catch (e) {
          console.error(`[PreloadViewer] Error flushing queued ${channel}:`, e);
        }
      }
    }

    return () => {
      if (listeners[channel]) {
        listeners[channel] = listeners[channel].filter((cb) => cb !== callback);
      }
    };
  },
});
