const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {
      console.warn("getPathForFile error:", e);
    }
    return file.path || "";
  },
  boot: () => ipcRenderer.invoke("boot"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  setCollapsed: (collapsed) => ipcRenderer.invoke("set-collapsed", collapsed),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.invoke("set-ignore-mouse-events", ignore, options),
  setIslandRect: (rect) => ipcRenderer.invoke("set-island-rect", rect),
  focusWindow: (focused) => ipcRenderer.invoke("focus-window", focused),
  reposition: () => ipcRenderer.invoke("reposition"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  launchApp: (nameOrPath) => ipcRenderer.invoke("launch-app", nameOrPath),
  closeApp: (nameOrPath) => ipcRenderer.invoke("close-app", nameOrPath),
  selectAppFile: () => ipcRenderer.invoke("select-app-file"),
  openSettingsWindow: () => ipcRenderer.invoke("open-settings-window"),
  quit: () => ipcRenderer.invoke("quit"),
  log: (msg) => ipcRenderer.invoke("log", msg),

  // AI & Chat
  chatSend: (query, context) => ipcRenderer.invoke("chat-send", { query, context }),
  chatReset: () => ipcRenderer.invoke("chat-reset"),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke("transcribe-audio", audioBase64),
  kokoroTTS: (text) => ipcRenderer.invoke("kokoro-tts", text),
  speakNative: (text) => ipcRenderer.invoke("speak-native", text),
  stopNativeSpeech: () => ipcRenderer.invoke("stop-native-speech"),

  // Files & Drive
  ingestFile: (path) => ipcRenderer.invoke("ingest-file", path),
  downloadDriveFile: (fileInfo) => ipcRenderer.invoke("download-drive-file", fileInfo),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  testDriveConnection: () => ipcRenderer.invoke("test-drive-connection"),
  selectServiceAccount: () => ipcRenderer.invoke("select-service-account"),
  getServiceAccountStatus: () => ipcRenderer.invoke("get-service-account-status"),
  googleOAuthStart: (creds) => ipcRenderer.invoke("google-oauth-start", creds),
  googleOAuthDisconnect: () => ipcRenderer.invoke("google-oauth-disconnect"),
  googleOAuthStatus: () => ipcRenderer.invoke("google-oauth-status"),
  selectOAuthClient: () => ipcRenderer.invoke("select-oauth-client"),

  // Schedule / Content Calendar
  getSchedule: () => ipcRenderer.invoke("get-schedule"),
  saveScheduleItem: (item) => ipcRenderer.invoke("save-schedule-item", item),
  deleteScheduleItem: (id) => ipcRenderer.invoke("delete-schedule-item", id),
  toggleScheduleItem: (id) => ipcRenderer.invoke("toggle-schedule-item", id),

  // Secrets & API Keys
  secretSet: (key, val) => ipcRenderer.invoke("secret-set", { key, val }),
  secretGet: (key) => ipcRenderer.invoke("secret-get", key),
  secretClear: (key) => ipcRenderer.invoke("secret-clear", key),

  testSupabase: (creds) => ipcRenderer.invoke("test-supabase", creds),

  // Live Partner Chat
  getChatMessages: () => ipcRenderer.invoke("get-chat-messages"),
  sendChatMessage: (arg1, arg2) => {
    const text = typeof arg1 === "string" ? arg1 : (arg1?.text || "");
    const isAiGenerated = typeof arg1 === "object" ? !!arg1.isAiGenerated : !!arg2;
    return ipcRenderer.invoke("send-chat-message", { text, isAiGenerated });
  },
  markChatRead: () => ipcRenderer.invoke("mark-chat-read"),

  // Remote Access (Mochi Eye Co-Pilot)
  requestRemoteAccess: () => ipcRenderer.invoke("request-remote-access"),
  respondRemoteAccess: (accepted, extra) => ipcRenderer.invoke("respond-remote-access", accepted, extra),
  sendRemoteSignal: (signal) => ipcRenderer.invoke("send-remote-signal", signal),
  endRemoteAccess: () => ipcRenderer.invoke("end-remote-access"),
  getPrimaryScreenSource: () => ipcRenderer.invoke("get-primary-screen-source"),
  injectInput: (cmd) => ipcRenderer.invoke("inject-remote-input", cmd),

  // Events from Main Process
  on: (channel, callback) => {
    const validChannels = [
      "cursor",
      "tray",
      "settings-changed",
      "schedule-updated",
      "file-received",
      "incoming-file",
      "partner-presence",
      "partner-chat-received",
      "open-couple-chat",
      "screen-changed",
      "mouse-enter",
      "mouse-leave",
      "remote-access-requested",
      "remote-access-accepted",
      "remote-access-declined",
      "remote-access-ended",
      "host-signal",
    ];
    if (validChannels.includes(channel)) {
      const handler = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
});
