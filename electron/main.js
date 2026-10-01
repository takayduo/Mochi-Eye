const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, shell, dialog, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, exec } = require("node:child_process");
const {
  getAccessToken,
  uploadFileToDrive,
  downloadFileFromDrive,
  startGoogleOAuthFlow,
  refreshOAuthAccessToken,
  uploadFileWithToken,
} = require("./gdrive");
const {
  testSupabaseConnection,
  initSupabase,
  disconnectSupabase,
  broadcastFileShared,
  broadcastScheduleUpdate,
  broadcastChatMessage,
  broadcastRemoteAccess,
} = require("./supabase");

const {
  startInputInjector,
  injectInput,
  stopInputInjector,
  getPrimaryScreenSource,
  createRemoteViewerWindow,
  getRemoteViewerWindow,
  closeRemoteViewerWindow,
} = require("./remoteAccess");


const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let overlayWin = null;
let settingsWin = null;
let tray = null;
let isQuitting = false;

app.on("second-instance", () => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    isCollapsed = false;
    overlayWin.show();
    overlayWin.focus();
    overlayWin.webContents.send("tray", "open");
  } else {
    createOverlayWindow();
  }
});

// Store paths
const userDataDir = path.join(app.getPath("userData"), "CoucouCreator");
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}
const settingsPath = path.join(userDataDir, "settings.json");
const schedulePath = path.join(userDataDir, "schedule.json");
const serviceAccountPath = path.join(userDataDir, "service-account.json");

function loadServiceAccount() {
  try {
    if (fs.existsSync(serviceAccountPath)) {
      return JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
    }
  } catch (err) {
    console.warn("Failed to read service-account.json:", err);
  }
  return null;
}

// Default settings
const DEFAULT_SETTINGS = {
  soundEnabled: true,
  soundVolume: 0.14,
  autoCloseInterval: 15,
  absenceInterval: 60,
  activeIntegrations: [],
  screen: "primary",
  autostart: false,
  aiProvider: "gemini", // "gemini" | "openrouter" | "groq"
  geminiApiKey: "",
  openrouterApiKey: "",
  groqApiKey: "",
  geminiModel: "gemini-2.5-flash",
  openrouterModel: "meta-llama/llama-3.3-70b-instruct:free",
  groqModel: "openai/gpt-oss-120b",
  micEnabled: true,
  userName: "Me",
  partnerName: "Her",
  userRole: "me", // "me" | "her"
  gdriveApiKey: "",
  gdriveFolderId: "",
  gdriveUploadUrl: "",
  shareChannel: "coucou-badsha-ayzil",
  syncUrl: "",
  syncApiKey: "",
  appPaths: {
    discord: "C:\\Users\\" + (process.env.USERNAME || "User") + "\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe",
    whatsapp: "explorer.exe shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App",
    obs: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe",
    premiere: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe",
    notepad: "notepad",
  },
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const loaded = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath, "utf-8")) };
      if (loaded.geminiModel === "gemini-3.8-flash" || loaded.geminiModel === "gemini-2.0-flash") {
        loaded.geminiModel = "gemini-2.5-flash";
      }
      if (loaded.groqModel === "llama-3.3-70b-versatile" || loaded.groqModel === "llama-3.1-8b-instant") {
        loaded.groqModel = "openai/gpt-oss-120b";
      }
      return loaded;
    }
  } catch (err) {
    console.error("Failed to read settings:", err);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

const startupFolderPath = path.join(
  process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : "C:\\Users\\Administrator\\AppData\\Roaming"),
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup"
);
const startupShortcutPath = path.join(startupFolderPath, "Mochi.lnk");

function applyStartupMode(enabled) {
  try {
    const isPackaged = app.isPackaged;
    const appDir = path.resolve(__dirname, "..");
    const execPath = process.execPath;
    const args = isPackaged ? [] : [appDir];

    // 1. Electron official API (Windows Registry Run key)
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: execPath,
        args: args,
        name: "CoucouCreator",
      });
    } catch (e) {
      console.warn("[Startup Mode] app.setLoginItemSettings warning:", e);
    }

    // 2. Windows Startup Folder .lnk Shortcut (native GUI, zero .vbs)
    try {
      if (!fs.existsSync(startupFolderPath)) {
        fs.mkdirSync(startupFolderPath, { recursive: true });
      }

      // Cleanup legacy .vbs if present
      const legacyVbs = path.join(startupFolderPath, "CoucouCreator.vbs");
      if (fs.existsSync(legacyVbs)) {
        try { fs.unlinkSync(legacyVbs); } catch {}
      }

      if (enabled) {
        const psScript = `
          $wsh = New-Object -ComObject WScript.Shell;
          $s = $wsh.CreateShortcut('${startupShortcutPath.replace(/'/g, "''")}');
          $s.TargetPath = '${execPath.replace(/'/g, "''")}';
          $s.Arguments = '${(isPackaged ? "" : appDir).replace(/'/g, "''")}';
          $s.WorkingDirectory = '${appDir.replace(/'/g, "''")}';
          $icon = '${path.join(appDir, "public", "icons", "icon.ico").replace(/'/g, "''")}';
          if (Test-Path $icon) { $s.IconLocation = "$icon,0" };
          $s.Save();
        `;
        exec(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, " ")}"`, (psErr) => {
          if (!psErr) {
            console.log(`[Startup Mode] Created startup shortcut at: ${startupShortcutPath}`);
          }
        });
      } else {
        if (fs.existsSync(startupShortcutPath)) {
          fs.unlinkSync(startupShortcutPath);
          console.log(`[Startup Mode] Removed startup shortcut from: ${startupShortcutPath}`);
        }
      }
    } catch (fsErr) {
      console.warn("[Startup Mode] Startup folder shortcut error:", fsErr);
    }

    console.log(`[Startup Mode] Windows auto-start set to: ${!!enabled}`);
  } catch (err) {
    console.warn("[Startup Mode] Failed to set auto-start:", err);
  }
}

function loadSchedule() {
  try {
    if (fs.existsSync(schedulePath)) {
      return JSON.parse(fs.readFileSync(schedulePath, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to read schedule:", err);
  }
  return [
    {
      id: "demo-1",
      title: "Record main YouTube video",
      time: "11:00 AM",
      assignee: "me",
      assignedBy: "her",
      completed: false,
      createdAt: Date.now(),
    },
    {
      id: "demo-2",
      title: "Review video intro cut & thumbnail",
      time: "03:30 PM",
      assignee: "her",
      assignedBy: "me",
      completed: true,
      createdAt: Date.now(),
    },
    {
      id: "demo-3",
      title: "YouTube Live Stream with community",
      time: "07:00 PM",
      assignee: "me",
      assignedBy: "her",
      completed: false,
      createdAt: Date.now(),
    },
  ];
}

function saveSchedule(items) {
  try {
    fs.writeFileSync(schedulePath, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save schedule:", err);
  }
}

let activeSettings = loadSettings();
let activeSchedule = loadSchedule();

const chatHistoryPath = path.join(userDataDir, "chat_history.json");

function loadChatHistory() {
  try {
    if (fs.existsSync(chatHistoryPath)) {
      const data = JSON.parse(fs.readFileSync(chatHistoryPath, "utf-8"));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn("Failed to load chat history:", err);
  }
  return [];
}

function saveChatHistory(history) {
  try {
    fs.writeFileSync(chatHistoryPath, JSON.stringify(history, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save chat history:", err);
  }
}

function startSupabaseSync() {
  if (!activeSettings.syncUrl || !activeSettings.syncApiKey) {
    console.log("[Supabase Sync] syncUrl or syncApiKey not configured yet.");
    disconnectSupabase();
    return;
  }

  const isMe = (activeSettings.userRole || "me") === "me";
  const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
  const rawPartner = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
  const currentUserName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);
  const partnerUserName = rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1);
  const partnerRole = isMe ? "her" : "me";

  console.log(`[Supabase Sync] Initializing live Realtime connection for ${currentUserName}...`);
  initSupabase({
    url: activeSettings.syncUrl,
    key: activeSettings.syncApiKey,
    channelName: activeSettings.shareChannel || "coucou-badsha-ayzil",
    userName: currentUserName,
    userRole: activeSettings.userRole || "me",
    onChatMessage: (payload) => {
      console.log("[Supabase Sync] Incoming chat message:", payload?.text);
      if (!payload || !payload.text) return;

      if (!payload.id) {
        payload.id = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      }
      if (!payload.timestamp) {
        payload.timestamp = Date.now();
      }

      const history = loadChatHistory();
      const exists = history.some((m) => m.id === payload.id);
      if (!exists) {
        history.push({
          ...payload,
          read: false,
        });
        saveChatHistory(history);
      }

      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("partner-chat-received", payload);
      }

      // Windows Action Center native notification if collapsed or app unfocused
      const isUnfocused = !overlayWin || overlayWin.isDestroyed() || !overlayWin.isFocused();
      if ((isCollapsed || isUnfocused) && Notification.isSupported()) {
        try {
          const sender = payload.sender || partnerUserName;
          const notif = new Notification({
            title: `💬 ${sender}`,
            body: payload.text,
            icon: path.join(__dirname, "../assets/icon.png"),
            silent: false,
          });
          notif.on("click", () => {
            if (overlayWin && !overlayWin.isDestroyed()) {
              isCollapsed = false;
              overlayWin.show();
              overlayWin.focus();
              overlayWin.webContents.send("open-couple-chat");
            }
          });
          notif.show();
        } catch (notifErr) {
          console.warn("[Supabase Sync] Chat Windows notification error:", notifErr);
        }
      }
    },
    onFileShared: (payload) => {
      console.log("[Supabase Sync] Incoming file event:", payload?.name);
      if (!payload || !payload.name) return;

      // Send to overlay UI
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("incoming-file", payload);
      }

      // Windows Action Center native notification
      if (Notification.isSupported()) {
        try {
          const sender = payload.senderName || partnerUserName;
          const sizeMb = payload.size ? (payload.size / (1024 * 1024)).toFixed(2) : "0";
          const notif = new Notification({
            title: `💌 New file from ${sender}!`,
            body: `${payload.name} (${sizeMb} MB)\nClick to open in Mochi`,
            icon: path.join(__dirname, "../assets/icon.png"),
            silent: false,
          });
          notif.on("click", () => {
            if (overlayWin && !overlayWin.isDestroyed()) {
              overlayWin.show();
              overlayWin.focus();
            }
          });
          notif.show();
        } catch (notifErr) {
          console.warn("[Supabase Sync] Windows notification error:", notifErr);
        }
      }
    },
    onScheduleUpdated: (payload) => {
      if (payload && Array.isArray(payload.items)) {
        console.log("[Supabase Sync] Real-time task update from:", payload.senderName);
        activeSchedule = payload.items;
        saveSchedule(activeSchedule);
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("schedule-updated", activeSchedule);
        }
      }
    },
    onPresenceSync: (presenceState) => {
      const myName = currentUserName.toLowerCase();
      const partnerName = partnerUserName.toLowerCase();
      let partnerOnline = false;

      for (const key of Object.keys(presenceState)) {
        const presList = presenceState[key] || [];
        for (const p of presList) {
          const pUser = (p.user || "").toLowerCase();
          if (p.role === partnerRole || pUser === partnerName || (pUser && pUser !== myName)) {
            partnerOnline = true;
            break;
          }
        }
        if (partnerOnline) break;
      }

      console.log(`[Supabase Sync] Partner online status: ${partnerOnline}`);
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("partner-presence", { online: partnerOnline, partnerName: partnerUserName });
      }
    },
    onRemoteAccess: (payload) => {
      console.log("[Supabase Sync] Incoming remote_access:", payload?.action, "from:", payload?.sender);
      if (!payload || !payload.action) return;

      const action = payload.action;

      if (action === "request") {
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("remote-access-requested", payload);
        }
      } else if (action === "response") {
        if (payload.accepted) {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.webContents.send("remote-access-accepted", payload);
          }
          createRemoteViewerWindow({
            partnerName: payload.sender || partnerUserName,
            onViewerReady: () => {
              const viewer = getRemoteViewerWindow();
              if (viewer) {
                viewer.webContents.send("viewer-partner-info", {
                  partnerName: payload.sender || partnerUserName,
                  remoteResolution: payload.resolution || { width: 1920, height: 1080 },
                });
              }
            },
            onViewerClosed: () => {
              broadcastRemoteAccess({ action: "end", sender: currentUserName });
              if (overlayWin && !overlayWin.isDestroyed()) {
                overlayWin.webContents.send("remote-access-ended");
              }
            },
          });
        } else {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.webContents.send("remote-access-declined", payload);
          }
        }
      } else if (action === "signal") {
        const viewer = getRemoteViewerWindow();
        if (viewer) {
          viewer.webContents.send("viewer-signal", payload.signal);
        } else if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("host-signal", payload.signal);
        }
      } else if (action === "input") {
        if (payload.cmd) {
          injectInput(payload.cmd);
        }
      } else if (action === "end") {
        closeRemoteViewerWindow();
        stopInputInjector();
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("remote-access-ended");
        }
      }
    },
  });
}

// Mouse tracking and click-through
let isCollapsed = true;
let currentIslandRect = { x: 240, y: 0, w: 240, h: 40 };
let isMouseInsideIsland = false;
let mouseCheckTimer = null;

function startMouseTracking() {
  if (mouseCheckTimer) clearInterval(mouseCheckTimer);
  mouseCheckTimer = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    try {
      const cursor = screen.getCursorScreenPoint();
      const winBounds = overlayWin.getBounds();
      const rect = currentIslandRect || { x: 240, y: 0, w: 240, h: 40 };

      // Island exact coordinates in screen space
      const islandLeft = winBounds.x + rect.x - 6;
      const islandRight = winBounds.x + rect.x + rect.w + 6;
      const islandTop = winBounds.y;
      const islandBottom = winBounds.y + Math.max(38, (rect.h || 40) + 8);

      const inside =
        cursor.x >= islandLeft &&
        cursor.x <= islandRight &&
        cursor.y >= islandTop &&
        cursor.y <= islandBottom;

      if (inside !== isMouseInsideIsland) {
        isMouseInsideIsland = inside;
        if (inside) {
          overlayWin.setIgnoreMouseEvents(false);
          overlayWin.webContents.send("mouse-enter");
        } else {
          overlayWin.setIgnoreMouseEvents(true, { forward: true });
          overlayWin.webContents.send("mouse-leave");
        }
      }
    } catch (e) {}
  }, 25);
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const panelWidth = 720;
  const panelHeight = 340;
  const x = Math.round((screenWidth - panelWidth) / 2);
  const y = 0;

  overlayWin = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const isDev = process.env.NODE_ENV === "development";
  const distIndex = path.join(__dirname, "..", "dist", "index.html");

  if (isDev) {
    overlayWin.loadURL("http://localhost:1420");
  } else if (fs.existsSync(distIndex)) {
    overlayWin.loadFile(distIndex);
  } else {
    // If not built yet, fallback to dev URL or wait
    overlayWin.loadURL("http://localhost:1420");
  }

  // Pass mouse clicks through outside the island pill to desktop & background apps
  overlayWin.setIgnoreMouseEvents(true);
  startMouseTracking();

  overlayWin.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Renderer] [${level}] ${message} (${sourceId}:${line})`);
  });

  overlayWin.on("closed", () => {
    if (mouseCheckTimer) {
      clearInterval(mouseCheckTimer);
      mouseCheckTimer = null;
    }
    overlayWin = null;
  });
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winW = 680;
  const winH = Math.min(760, screenHeight - 60);
  const winX = Math.round((screenWidth - winW) / 2);
  const winY = 60;

  settingsWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    title: "Coucou Creator Settings",
    backgroundColor: "#0b0c0e",
    frame: true,
    autoHideMenuBar: true,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.setAlwaysOnTop(true, "screen-saver");

  settingsWin.on("focus", () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setAlwaysOnTop(false);
    }
    settingsWin.setAlwaysOnTop(true, "screen-saver");
  });

  settingsWin.on("blur", () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setAlwaysOnTop(true, "screen-saver");
    }
  });

  const isDev = process.env.NODE_ENV === "development";
  const distSettings = path.join(__dirname, "..", "dist", "settings.html");

  if (isDev) {
    settingsWin.loadURL("http://localhost:1420/settings.html");
  } else if (fs.existsSync(distSettings)) {
    settingsWin.loadFile(distSettings);
  } else {
    settingsWin.loadURL("http://localhost:1420/settings.html");
  }

  settingsWin.on("closed", () => {
    settingsWin = null;
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setAlwaysOnTop(true, "screen-saver");
    }
  });
}

function setupTray() {
  const iconPath = path.join(__dirname, "..", "public", "icons", "icon.ico");
  let trayIcon = nativeImage.createEmpty();
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Coucou Creator Companion");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Coucou",
      click: () => {
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("tray", "open");
        }
      },
    },
    {
      label: "Settings…",
      click: () => createSettingsWindow(),
    },
    {
      label: "Pause",
      click: () => {
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("tray", "pause");
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("tray", "open");
    }
  });
}

// ── App Launcher & Closer ───────────────────────────────────────────────────

function getProcessCandidates(appNameOrPath) {
  const query = (appNameOrPath || "").toLowerCase().trim().replace(/^["']|["']$/g, "");
  const candidates = new Set();

  // 1. Check if configured in activeSettings.appPaths
  const paths = activeSettings.appPaths || {};
  let configuredVal = null;
  for (const [key, val] of Object.entries(paths)) {
    if (val && (query.includes(key.toLowerCase()) || key.toLowerCase().includes(query))) {
      configuredVal = String(val).trim().replace(/^["']|["']$/g, "");
      break;
    }
  }

  if (configuredVal) {
    // If it is a Windows shortcut .lnk, read the target executable
    if (configuredVal.toLowerCase().endsWith(".lnk") && fs.existsSync(configuredVal)) {
      try {
        const linkInfo = shell.readShortcutLink(configuredVal);
        if (linkInfo && linkInfo.target) {
          candidates.add(path.basename(linkInfo.target));
        }
      } catch {}
    }

    // If it has --processStart App.exe (e.g. Discord update wrapper)
    const procStartMatch = configuredVal.match(/--processStart\s+([^\s]+\.exe)/i);
    if (procStartMatch) {
      candidates.add(procStartMatch[1]);
    }

    // Extract any .exe in configuredVal
    const exeMatches = configuredVal.match(/([a-zA-Z0-9_\-\. ]+\.exe)/gi);
    if (exeMatches) {
      for (const m of exeMatches) {
        const clean = m.trim();
        if (!clean.toLowerCase().includes("explorer.exe") && !clean.toLowerCase().includes("cmd.exe")) {
          candidates.add(clean);
        }
      }
    }

    // Base name matching from shortcut name (e.g. "OBS RECORDING.lnk", "Roblox Player.lnk")
    const base = path.basename(configuredVal).replace(/\.(lnk|url|exe)$/i, "").toLowerCase();
    if (base.includes("obs")) {
      candidates.add("obs64.exe");
      candidates.add("obs32.exe");
      candidates.add("obs.exe");
    }
    if (base.includes("roblox")) {
      candidates.add("RobloxPlayerBeta.exe");
      candidates.add("RobloxPlayer.exe");
      candidates.add("Roblox.exe");
    }
    if (base.includes("fortnite")) {
      candidates.add("FortniteClient-Win64-Shipping.exe");
      candidates.add("FortniteLauncher.exe");
    }
    if (base.includes("premiere")) {
      candidates.add("Adobe Premiere Pro.exe");
    }
  }

  // 2. Built-in known process mappings for common Windows apps
  if (query.includes("notepad")) {
    candidates.add("Notepad.exe");
    candidates.add("notepad.exe");
  }
  if (query.includes("whatsapp")) {
    candidates.add("WhatsApp.exe");
    candidates.add("WhatsAppDesktop.exe");
  }
  if (query.includes("discord")) {
    candidates.add("Discord.exe");
  }
  if (query.includes("obs") || query.includes("stream")) {
    candidates.add("obs64.exe");
    candidates.add("obs32.exe");
    candidates.add("obs.exe");
  }
  if (query.includes("roblox")) {
    candidates.add("RobloxPlayerBeta.exe");
    candidates.add("RobloxPlayer.exe");
  }
  if (query.includes("fortnite")) {
    candidates.add("FortniteClient-Win64-Shipping.exe");
    candidates.add("FortniteLauncher.exe");
  }
  if (query.includes("premiere")) {
    candidates.add("Adobe Premiere Pro.exe");
  }
  if (query.includes("chrome")) {
    candidates.add("chrome.exe");
  }
  if (query.includes("edge") || query.includes("msedge")) {
    candidates.add("msedge.exe");
  }
  if (query.includes("spotify")) {
    candidates.add("Spotify.exe");
  }
  if (query.includes("calc") || query.includes("calculator")) {
    candidates.add("CalculatorApp.exe");
    candidates.add("Calculator.exe");
    candidates.add("calc.exe");
  }
  if (query.includes("paint") || query.includes("mspaint")) {
    candidates.add("mspaint.exe");
    candidates.add("PaintApp.exe");
  }
  if (query.includes("code") || query.includes("vscode")) {
    candidates.add("Code.exe");
  }
  if (query.includes("telegram")) {
    candidates.add("Telegram.exe");
  }
  if (query.includes("steam")) {
    candidates.add("steam.exe");
  }

  // 3. Direct base name as process
  const cleanName = path.basename(appNameOrPath).trim().replace(/^["']|["']$/g, "");
  if (cleanName.endsWith(".exe")) {
    candidates.add(cleanName);
  } else {
    candidates.add(`${cleanName}.exe`);
  }

  return Array.from(candidates);
}

function launchApplication(appNameOrPath) {
  const query = (appNameOrPath || "").toLowerCase().trim().replace(/^["']|["']$/g, "");
  const paths = activeSettings.appPaths || {};

  let targetPath = null;
  for (const [key, val] of Object.entries(paths)) {
    if (val && (query.includes(key.toLowerCase()) || key.toLowerCase().includes(query))) {
      targetPath = val;
      break;
    }
  }

  if (!targetPath) {
    const rawClean = appNameOrPath ? appNameOrPath.trim().replace(/^["']|["']$/g, "") : "";
    if (rawClean && (rawClean.endsWith(".exe") || rawClean.endsWith(".lnk") || rawClean.endsWith(".url")) && fs.existsSync(rawClean)) {
      targetPath = rawClean;
    } else {
      // Common Windows app fallback
      if (query.includes("discord")) targetPath = "discord";
      else if (query.includes("whatsapp")) targetPath = "explorer.exe shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App";
      else if (query.includes("obs")) targetPath = "obs";
      else if (query.includes("premiere")) targetPath = "premiere";
      else if (query.includes("chrome")) targetPath = "chrome";
      else if (query.includes("notepad")) targetPath = "notepad";
      else if (query.includes("calculator") || query.includes("calc")) targetPath = "calc";
      else if (query.includes("paint") || query.includes("mspaint")) targetPath = "mspaint";
      else if (query.includes("spotify")) targetPath = "spotify";
      else if (query.includes("vscode") || query.includes("code")) targetPath = "code";
      else targetPath = appNameOrPath;
    }
  }

  const clean = (targetPath || "").trim().replace(/^["']|["']$/g, "");

  return new Promise((resolve) => {
    if (!clean) {
      return resolve({ success: false, error: "Empty path" });
    }

    if (clean.startsWith("explorer.exe")) {
      exec(`start "" ${clean}`, (err) => {
        if (err) resolve({ success: false, error: err.message });
        else resolve({ success: true, path: clean });
      });
    } else if (clean.includes(" ") || clean.toLowerCase().endsWith(".lnk") || clean.toLowerCase().endsWith(".url")) {
      exec(`start "" "${clean}"`, (err) => {
        if (err) {
          shell.openPath(clean).then((openErr) => {
            if (openErr) resolve({ success: false, error: openErr });
            else resolve({ success: true, path: clean });
          });
        } else {
          resolve({ success: true, path: clean });
        }
      });
    } else {
      exec(`start "" "${clean}"`, (err) => {
        if (!err) {
          resolve({ success: true, path: clean });
        } else {
          try {
            const proc = spawn(clean, [], { detached: true, stdio: "ignore", shell: true });
            proc.unref();
            resolve({ success: true, path: clean });
          } catch (spawnErr) {
            resolve({ success: false, error: spawnErr.message });
          }
        }
      });
    }
  });
}

function closeApplication(appNameOrPath) {
  const candidates = getProcessCandidates(appNameOrPath);
  console.log(`[App Closer] Closing ${appNameOrPath}, checking candidates:`, candidates);

  return new Promise((resolve) => {
    let closedAny = false;
    let checked = 0;

    if (candidates.length === 0) {
      return resolve({ success: false, error: "No matching process candidate found." });
    }

    candidates.forEach((proc) => {
      exec(`taskkill /IM "${proc}" /F /T`, (err, stdout) => {
        checked++;
        if (!err && stdout && stdout.includes("SUCCESS")) {
          closedAny = true;
          console.log(`[App Closer] Terminated ${proc}:`, stdout.trim());
        }

        if (checked === candidates.length) {
          if (closedAny) {
            resolve({ success: true, app: appNameOrPath });
          } else {
            // PowerShell wildcard fallback for modern Windows Store apps or exact names
            const queryName = appNameOrPath.replace(/\.exe$/i, "").trim();
            exec(`powershell -NoProfile -Command "Stop-Process -Name '*${queryName}*' -Force -ErrorAction Stop"`, (psErr) => {
              if (!psErr) {
                console.log(`[App Closer] Terminated via PowerShell: *${queryName}*`);
                resolve({ success: true, app: appNameOrPath });
              } else {
                resolve({ success: false, notRunning: true, error: "App was not running." });
              }
            });
          }
        }
      });
    });
  });
}

// ── AI Engine (Gemini / OpenRouter / Grok) ───────────────────────────────────

async function callAI(query, context) {
  const provider = activeSettings.aiProvider || "gemini";
  const userRole = activeSettings.userRole || "me";
  const partnerRole = userRole === "me" ? "her" : "me";

  // When userRole is "me": this PC belongs to userName (Badsha), partner is partnerName (Ayzil)
  // When userRole is "her": this PC belongs to partnerName (Ayzil), partner is userName (Badsha)
  const currentUserName = userRole === "me" 
    ? (activeSettings.userName || "Badsha") 
    : (activeSettings.partnerName || "Ayzil");
  const partnerUserName = userRole === "me" 
    ? (activeSettings.partnerName || "Ayzil") 
    : (activeSettings.userName || "Badsha");

  // Separate tasks strictly by assignee
  const myTasks = activeSchedule.filter((s) => s.assignee === userRole);
  const partnerTasks = activeSchedule.filter((s) => s.assignee === partnerRole);

  const myTasksText = myTasks.length > 0
    ? myTasks.map((s) => `• [${s.completed ? "DONE" : "PENDING"}] ${s.time} - ${s.title}${s.assignedBy === partnerRole ? ` (set by ${partnerUserName})` : ""}`).join("\n")
    : "No tasks scheduled for today.";

  const partnerTasksText = partnerTasks.length > 0
    ? partnerTasks.map((s) => `• [${s.completed ? "DONE" : "PENDING"}] ${s.time} - ${s.title}${s.assignedBy === userRole ? ` (set by ${currentUserName})` : ""}`).join("\n")
    : "No tasks scheduled for today.";

  const systemPrompt = `You are Mochi, a super cute, warm, energetic, and snappy AI desktop companion for YouTube creator couple ${currentUserName} and ${partnerUserName}.
CURRENT ACTIVE USER ON THIS PC: ${currentUserName}
THEIR PARTNER: ${partnerUserName}

--- ${currentUserName.toUpperCase()}'S TASKS (${currentUserName}'s Personal Schedule) ---
${myTasksText}

--- ${partnerUserName.toUpperCase()}'S TASKS (${partnerUserName}'s Personal Schedule) ---
${partnerTasksText}

Configured Apps: ${Object.keys(activeSettings.appPaths || {}).join(", ")}

CRITICAL IDENTITY & TASK OWNERSHIP RULES:
1. You are speaking directly to ${currentUserName}.
2. When ${currentUserName} asks about "my task", "my tasks", "my schedule", "what do I have to do", or "what should I do":
   -> You MUST ONLY list ${currentUserName}'s tasks.
   -> NEVER list, count, or mix up ${partnerUserName}'s tasks as ${currentUserName}'s tasks!
3. Only if ${currentUserName} specifically asks about ${partnerUserName} (e.g. "what does ${partnerUserName} have to do", "her tasks", "${partnerUserName}'s schedule"):
   -> Tell them about ${partnerUserName}'s tasks.
4. If ${currentUserName} asks for "both of our tasks" or "all tasks":
   -> Clearly separate who has what: tell them what ${currentUserName} has to do, and what ${partnerUserName} has to do.
5. Answer length: Keep answers VERY SHORT, sweet, and assistant-friendly (maximum 1-2 short sentences!).
6. Spoken natural style: Do NOT use markdown symbols (no **, ##, *, backticks) or bullet spam in spoken answers. Speak naturally so it sounds warm and clean out loud.
7. If asked to open/launch an app: Say e.g. "Opening Discord right now! 🚀" and append [LAUNCH: app_name].
8. If asked to close/exit/kill/quit an app: Say e.g. "Closing Discord for you! ✨" and append [CLOSE: app_name].
9. If asked to add a task for ${currentUserName}: Confirm and append [ADD_TASK: {"title":"...","time":"...","for":"${userRole}"}].
10. If asked to add a task for ${partnerUserName}: Confirm and append [ADD_TASK: {"title":"...","time":"...","for":"${partnerRole}"}].
11. If asked to mark done: Confirm in one line and append [MARK_DONE: task_id_or_title].
12. If asked to send/text a message to ${partnerUserName}: Confirm in a sweet sentence and append [SEND_CHAT: {"text":"..."}].
13. Be sweet, playful, and cheerful with cute emojis!`;

  const queryLower = query.toLowerCase();

  // Fast direct keyword checks for checking messages
  const isAskingNewMessages =
    /\b(any (new )?(messages?|texts?)|check (my )?(messages?|texts?|inbox)|did (she|he|ayzil|badsha|partner) (text|message|say anything)|unread (messages?|texts?)|read (my )?(messages?|texts?))\b/i.test(queryLower);

  if (isAskingNewMessages) {
    const history = loadChatHistory();
    const unread = history.filter((m) => !m.read && (m.sender || "").toLowerCase() !== currentUserName.toLowerCase());
    if (unread.length === 0) {
      return { text: `You're all caught up, ${currentUserName}! ✨ No unread messages from ${partnerUserName} right now.` };
    }

    for (const m of unread) m.read = true;
    saveChatHistory(history);
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("partner-chat-received");
    }

    const count = unread.length;
    const latest = unread[unread.length - 1];
    const minutesAgo = Math.max(1, Math.round((Date.now() - latest.timestamp) / 60000));
    const timeStr = minutesAgo < 60 ? `${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago` : "recently";

    if (count === 1) {
      return { text: `You have 1 unread message from ${partnerUserName}. ${timeStr} ${partnerUserName} said: "${latest.text}" 💌` };
    } else {
      const msgsSummary = unread.map((m) => `"${m.text}"`).join(", and then ");
      return { text: `You have ${count} unread messages from ${partnerUserName}. ${partnerUserName} said: ${msgsSummary} 💌` };
    }
  }

  // Fast direct check for sending message to partner
  const sendMsgMatch =
    /^(?:send a message to|message|text|tell)\s+(?:ayzil|badsha|her|him|partner)\s*[:,-]?\s*(.+)$/i.exec(query) ||
    /^reply\s*[:,-]?\s*(.+)$/i.exec(query);

  if (sendMsgMatch) {
    const messageText = (sendMsgMatch[1] || "").trim();
    if (messageText) {
      const history = loadChatHistory();
      const newMsg = {
        id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        sender: currentUserName,
        recipient: partnerUserName,
        text: messageText,
        timestamp: Date.now(),
        read: true,
        isAiGenerated: true,
      };
      history.push(newMsg);
      saveChatHistory(history);

      try {
        await broadcastChatMessage(newMsg);
      } catch (err) {
        console.warn("[AI Dispatch Chat] Error broadcasting:", err);
      }

      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("partner-chat-received", newMsg);
      }

      return { text: `Sent to ${partnerUserName}: "${messageText}" 💌` };
    }
  }

  // Fast direct keyword checks for startup mode
  if (/\b(enable|turn on|activate)\s+(startup|auto[- ]?start)\b|\b(start|launch|open)\s+(on|with)\s+(startup|boot|pc|windows)\b/i.test(queryLower)) {
    activeSettings.autostart = true;
    saveSettings(activeSettings);
    applyStartupMode(true);
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("settings-changed", activeSettings);
    }
    return { text: "Startup mode is now turned ON! 🚀 Mochi will launch instantly whenever your PC turns on." };
  }
  if (/\b(disable|turn off|deactivate)\s+(startup|auto[- ]?start)\b|\b(stop|don'?t)\s+(starting|launching|opening)\s+(on|with)\s+(startup|boot|pc|windows)\b/i.test(queryLower)) {
    activeSettings.autostart = false;
    saveSettings(activeSettings);
    applyStartupMode(false);
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("settings-changed", activeSettings);
    }
    return { text: "Startup mode is now turned OFF. Mochi will only open when manually launched." };
  }

  // Fast direct keyword checks for app launching
  if (queryLower.startsWith("open ") || queryLower.startsWith("launch ")) {
    const target = query.replace(/^(open|launch)\s+/i, "").trim();
    const result = await launchApplication(target);
    if (result.success) {
      return { text: `Opening ${target} right away! 🚀` };
    }
  }

  // Fast direct keyword checks for app closing
  if (
    queryLower.startsWith("close ") ||
    queryLower.startsWith("quit ") ||
    queryLower.startsWith("exit ") ||
    queryLower.startsWith("kill ") ||
    queryLower.startsWith("stop ")
  ) {
    const target = query.replace(/^(close|quit|exit|kill|stop)\s+/i, "").trim();
    const result = await closeApplication(target);
    if (result.success) {
      return { text: `Closed ${target} for you! ✨` };
    } else if (result.notRunning) {
      return { text: `${target} isn't currently open! 😊` };
    } else {
      return { text: `Couldn't close ${target}: ${result.error || "app error"}` };
    }
  }

  // Fast direct keyword checks for schedule / tasks
  const isAskingMyTasks =
    /\b(my task|my tasks|my schedule|my plan|my to[- ]?do|what do i (have to|need to)? do|what('s| is) (my|on my) (task|tasks|schedule)|tell me (about )?my (task|tasks)|what should i do)\b/i.test(queryLower);

  const isAskingPartnerTasks =
    new RegExp(`\\b(her task|her tasks|his task|his tasks|partner('s)? task|partner('s)? tasks|what does (she|he|${partnerUserName.toLowerCase()}) have to do|${partnerUserName.toLowerCase()}('s)? (task|tasks|schedule)|tell me (about )?${partnerUserName.toLowerCase()}('s)? (task|tasks))\\b`, "i").test(queryLower);

  const isAskingAllTasks =
    /\b(both of our tasks|both our tasks|all tasks|our tasks|our schedule|what do we have to do)\b/i.test(queryLower);

  if (isAskingMyTasks) {
    if (myTasks.length === 0) {
      return { text: `Hey ${currentUserName}! ✨ No tasks scheduled for you right now. Relax or plan with ${partnerUserName}! 🎬` };
    }
    const pending = myTasks.filter((s) => !s.completed);
    let briefing = `Hey ${currentUserName}! ✨ Here's your task list for today:\n`;
    for (const t of myTasks) {
      const fromPartner = t.assignedBy === partnerRole ? ` (from ${partnerUserName} 💖)` : "";
      briefing += `• ${t.completed ? "Done" : "Pending"}: ${t.time} - ${t.title}${fromPartner}\n`;
    }
    briefing += `You have ${pending.length} pending task${pending.length === 1 ? "" : "s"}!`;
    return { text: briefing };
  }

  if (isAskingPartnerTasks) {
    if (partnerTasks.length === 0) {
      return { text: `Hey ${currentUserName}! ✨ ${partnerUserName} has no tasks scheduled yet today. You can add one for them! 💖` };
    }
    const pending = partnerTasks.filter((s) => !s.completed);
    let briefing = `Hey ${currentUserName}! ✨ Here's ${partnerUserName}'s schedule for today:\n`;
    for (const t of partnerTasks) {
      const fromYou = t.assignedBy === userRole ? ` (set by you ✨)` : "";
      briefing += `• ${t.completed ? "Done" : "Pending"}: ${t.time} - ${t.title}${fromYou}\n`;
    }
    briefing += `${partnerUserName} has ${pending.length} pending task${pending.length === 1 ? "" : "s"}!`;
    return { text: briefing };
  }

  if (isAskingAllTasks) {
    let briefing = `Hey ${currentUserName}! ✨ Here's both of your schedules for today:\n\n`;
    briefing += `For ${currentUserName}:\n`;
    if (myTasks.length === 0) {
      briefing += `• No tasks scheduled.\n`;
    } else {
      for (const t of myTasks) {
        briefing += `• ${t.completed ? "Done" : "Pending"}: ${t.time} - ${t.title}\n`;
      }
    }
    briefing += `\nFor ${partnerUserName}:\n`;
    if (partnerTasks.length === 0) {
      briefing += `• No tasks scheduled.\n`;
    } else {
      for (const t of partnerTasks) {
        briefing += `• ${t.completed ? "Done" : "Pending"}: ${t.time} - ${t.title}\n`;
      }
    }
    return { text: briefing };
  }

  let finalQuery = query;
  if (context && context.kind === "file") {
    finalQuery = `[Attached File: "${context.name}" (local path: ${context.path})]\n\n${query}`;
  }

  // 1. Google Gemini API (Free tier)
  if (provider === "gemini") {
    const key = activeSettings.geminiApiKey;
    if (!key) {
      return { text: "Please enter your free Google Gemini API Key in Settings (⚙️) to chat with me!" };
    }
    const model = activeSettings.geminiModel || "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nUser asks: ${finalQuery}` }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Mochi is thinking...";
    await processAITags(reply);
    return { text: cleanAITags(reply) };
  }

  // 2. OpenRouter API
  if (provider === "openrouter") {
    const key = activeSettings.openrouterApiKey;
    if (!key) {
      return { text: "Please enter your OpenRouter API Key in Settings (⚙️) to chat with me!" };
    }
    const model = activeSettings.openrouterModel || "meta-llama/llama-3.3-70b-instruct:free";
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://coucou.creator",
        "X-Title": "Coucou Creator",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalQuery },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "Mochi has no words!";
    await processAITags(reply);
    return { text: cleanAITags(reply) };
  }

  // 3. Groq (GroqCloud LPUs) API
  if (provider === "groq" || provider === "grok") {
    const key = activeSettings.groqApiKey || activeSettings.grokApiKey;
    if (!key) {
      return { text: "Please enter your free Groq API Key (gsk_...) in Settings (⚙️) to chat with me!" };
    }
    const model = activeSettings.groqModel || "llama-3.3-70b-versatile";
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalQuery },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "Groq responded with empty output!";
    await processAITags(reply);
    return { text: cleanAITags(reply) };
  }

  return { text: "No AI provider configured. Please open Settings." };
}

async function processAITags(text) {
  // Check for [LAUNCH: app]
  const launchMatch = text.match(/\[LAUNCH:\s*([^\]]+)\]/i);
  if (launchMatch) {
    const appToLaunch = launchMatch[1].trim();
    await launchApplication(appToLaunch);
  }

  // Check for [CLOSE: app]
  const closeMatch = text.match(/\[CLOSE:\s*([^\]]+)\]/i);
  if (closeMatch) {
    const appToClose = closeMatch[1].trim();
    await closeApplication(appToClose);
  }

  // Check for [ADD_TASK: ...]
  const taskMatch = text.match(/\[ADD_TASK:\s*(\{.+?\})\]/i);
  if (taskMatch) {
    try {
      const taskData = JSON.parse(taskMatch[1]);
      const targetAssignee = taskData.for === "her" ? "her" : "me";
      const targetTitle = (taskData.title || "New Task").trim();

      // Deduplicate: ignore if same task title & assignee was created within the last 15 seconds
      const isDuplicate = activeSchedule.some(
        (t) =>
          (t.title || "").toLowerCase().trim() === targetTitle.toLowerCase() &&
          t.assignee === targetAssignee &&
          Date.now() - (t.createdAt || 0) < 15000
      );

      if (!isDuplicate) {
        const newItem = {
          id: "task-" + Date.now(),
          title: targetTitle,
          time: taskData.time || "12:00 PM",
          assignee: targetAssignee,
          assignedBy: activeSettings.userRole || "me",
          completed: false,
          createdAt: Date.now(),
        };
        activeSchedule.push(newItem);
        saveSchedule(activeSchedule);
        syncScheduleToPartner();
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("schedule-updated", activeSchedule);
        }
      } else {
        console.log("[Task Deduplication] Prevented duplicate task addition:", targetTitle);
      }
    } catch {}
  }

  // Check for [SEND_CHAT: ...]
  const chatMatch = text.match(/\[SEND_CHAT:\s*(\{.+?\})\]/i);
  if (chatMatch) {
    try {
      const chatData = JSON.parse(chatMatch[1]);
      if (chatData.text) {
        const history = loadChatHistory();
        const isMe = (activeSettings.userRole || "me") === "me";
        const myName = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
        const partnerName = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
        const newMsg = {
          id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          sender: myName,
          recipient: partnerName,
          text: chatData.text,
          timestamp: Date.now(),
          read: true,
          isAiGenerated: true,
        };
        history.push(newMsg);
        saveChatHistory(history);
        broadcastChatMessage(newMsg).catch(() => {});
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("partner-chat-received", newMsg);
        }
      }
    } catch (err) {
      console.warn("AI chat send error:", err);
    }
  }
}

function cleanAITags(text) {
  return text
    .replace(/\[LAUNCH:\s*[^\]]+\]/gi, "")
    .replace(/\[CLOSE:\s*[^\]]+\]/gi, "")
    .replace(/\[ADD_TASK:\s*\{.+?\}\]/gi, "")
    .replace(/\[MARK_DONE:\s*[^\]]+\]/gi, "")
    .replace(/\[SEND_CHAT:\s*\{.+?\}\]/gi, "")
    .trim();
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle("boot", () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    settings: activeSettings,
    schedule: activeSchedule,
    screen: {
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      scale: primaryDisplay.scaleFactor,
    },
    version: "1.0.0-creator",
    hookPath: "",
  };
});

ipcMain.handle("save-settings", (_event, newSettings) => {
  const oldAutostart = activeSettings.autostart;
  activeSettings = { ...activeSettings, ...newSettings };
  saveSettings(activeSettings);
  if (oldAutostart !== activeSettings.autostart) {
    applyStartupMode(activeSettings.autostart);
  }
  startSupabaseSync();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("settings-changed", activeSettings);
  }
  return true;
});

ipcMain.handle("test-supabase", async (_event, creds) => {
  return await testSupabaseConnection(creds || {
    url: activeSettings.syncUrl,
    key: activeSettings.syncApiKey,
  });
});

ipcMain.handle("get-chat-messages", () => {
  return loadChatHistory();
});

ipcMain.handle("send-chat-message", async (_event, arg) => {
  const history = loadChatHistory();
  const isMe = (activeSettings.userRole || "me") === "me";
  const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
  const rawPartner = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
  const myName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);
  const partnerName = rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1);

  let rawText = "";
  let isAiGenerated = false;

  if (typeof arg === "string") {
    rawText = arg;
  } else if (typeof arg === "object" && arg !== null) {
    if (typeof arg.text === "string") {
      rawText = arg.text;
    } else if (typeof arg.text === "object" && arg.text !== null && typeof arg.text.text === "string") {
      rawText = arg.text.text;
    }
    isAiGenerated = !!arg.isAiGenerated;
  }

  const cleanText = (rawText || "").trim();
  if (!cleanText) {
    console.warn("[Chat Send] Empty message text received");
    return null;
  }

  const msg = {
    id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    sender: myName,
    recipient: partnerName,
    text: cleanText,
    timestamp: Date.now(),
    read: true,
    isAiGenerated: isAiGenerated,
  };

  history.push(msg);
  saveChatHistory(history);

  try {
    await broadcastChatMessage(msg);
    console.log(`[Supabase Realtime] Sent chat message from ${myName}: "${cleanText}"`);
  } catch (err) {
    console.warn("[Supabase Realtime] Chat send error:", err);
  }

  return msg;
});

ipcMain.handle("mark-chat-read", () => {
  const history = loadChatHistory();
  const isMe = (activeSettings.userRole || "me") === "me";
  const myName = (isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil")).toLowerCase();
  let updated = false;

  for (const m of history) {
    if (!m.read && (m.sender || "").toLowerCase() !== myName) {
      m.read = true;
      updated = true;
    }
  }

  if (updated) {
    saveChatHistory(history);
  }
  return true;
});

// ── Remote Access (Mochi Eye Co-Pilot) ───────────────────────────────────────
ipcMain.handle("request-remote-access", async () => {
  const isMe = (activeSettings.userRole || "me") === "me";
  const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
  const currentUserName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);
  return await broadcastRemoteAccess({ action: "request", sender: currentUserName });
});

ipcMain.handle("respond-remote-access", async (_event, accepted) => {
  const isMe = (activeSettings.userRole || "me") === "me";
  const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
  const currentUserName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);

  if (accepted) {
    startInputInjector();
    const primary = screen.getPrimaryDisplay();
    return await broadcastRemoteAccess({
      action: "response",
      accepted: true,
      sender: currentUserName,
      resolution: { width: primary.bounds.width, height: primary.bounds.height },
    });
  } else {
    return await broadcastRemoteAccess({
      action: "response",
      accepted: false,
      sender: currentUserName,
    });
  }
});

ipcMain.handle("send-remote-signal", async (_event, signal) => {
  return await broadcastRemoteAccess({ action: "signal", signal });
});

ipcMain.handle("end-remote-access", async () => {
  closeRemoteViewerWindow();
  stopInputInjector();
  return await broadcastRemoteAccess({ action: "end" });
});

ipcMain.handle("get-primary-screen-source", async () => {
  return await getPrimaryScreenSource();
});

ipcMain.handle("inject-remote-input", (_event, cmd) => {
  if (cmd) injectInput(cmd);
  return true;
});

// Viewer Window IPC handlers
ipcMain.handle("viewer-get-partner-info", () => {
  const isMe = (activeSettings.userRole || "me") === "me";
  const rawPartner = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
  const partnerUserName = rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1);
  const primary = screen.getPrimaryDisplay();
  return {
    partnerName: partnerUserName,
    remoteResolution: { width: primary.bounds.width, height: primary.bounds.height },
  };
});

ipcMain.handle("viewer-send-signal", async (_event, signal) => {
  return await broadcastRemoteAccess({ action: "signal", signal });
});

ipcMain.handle("viewer-send-input", async (_event, cmd) => {
  return await broadcastRemoteAccess({ action: "input", cmd });
});

ipcMain.handle("viewer-toggle-fullscreen", () => {
  const viewer = getRemoteViewerWindow();
  if (viewer) {
    viewer.setFullScreen(!viewer.isFullScreen());
  }
  return true;
});

ipcMain.handle("viewer-end-session", async () => {
  closeRemoteViewerWindow();
  stopInputInjector();
  const isMe = (activeSettings.userRole || "me") === "me";
  const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
  const currentUserName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);
  return await broadcastRemoteAccess({ action: "end", sender: currentUserName });
});

ipcMain.handle("set-collapsed", (_event, collapsed) => {
  isCollapsed = collapsed;
  return true;
});

ipcMain.handle("set-ignore-mouse-events", (_event, ignore, options) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    isMouseInsideIsland = !ignore;
    overlayWin.setIgnoreMouseEvents(ignore, options);
  }
  return true;
});

ipcMain.handle("set-island-rect", (_event, rect) => {
  if (rect) {
    currentIslandRect = rect;
  }
  return true;
});

ipcMain.handle("focus-window", (_event, focused) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    if (focused) overlayWin.focus();
  }
  return true;
});

ipcMain.handle("reposition", () => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const panelWidth = 720;
    const x = Math.round((screenWidth - panelWidth) / 2);
    overlayWin.setPosition(x, 0);
  }
  return true;
});

ipcMain.handle("open-url", (_event, url) => {
  if (url) shell.openExternal(url);
  return true;
});

ipcMain.handle("launch-app", async (_event, nameOrPath) => {
  return await launchApplication(nameOrPath);
});

ipcMain.handle("close-app", async (_event, nameOrPath) => {
  return await closeApplication(nameOrPath);
});

ipcMain.handle("select-app-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Application Executable or Shortcut",
    properties: ["openFile"],
    filters: [
      { name: "Applications & Shortcuts (*.exe, *.lnk, *.bat, *.cmd)", extensions: ["exe", "lnk", "bat", "cmd"] },
      { name: "All Files (*.*)", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle("open-settings-window", () => {
  createSettingsWindow();
  return true;
});

ipcMain.handle("quit", () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle("log", (_event, msg) => {
  console.log("[Renderer Log]:", msg);
  return true;
});

ipcMain.handle("chat-send", async (_event, { query, context }) => {
  return await callAI(query, context);
});

ipcMain.handle("chat-reset", () => {
  return true;
});

// ── Voice: Groq Whisper Transcription & Kokoro TTS ───────────────────────────

ipcMain.handle("transcribe-audio", async (_event, audioBase64) => {
  try {
    const key = activeSettings.groqApiKey || activeSettings.grokApiKey;
    if (!key) {
      return { success: false, error: "Please enter your free Groq API key in Settings (⚙️) for voice recognition!" };
    }
    const buffer = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    const file = new File([buffer], "audio.wav", { type: "audio/wav" });
    formData.append("file", file);
    formData.append("model", "whisper-large-v3-turbo");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper transcription failed: ${err}`);
    }

    const data = await res.json();
    return { success: true, text: data.text ? data.text.trim() : "" };
  } catch (err) {
    console.error("Transcribe audio error:", err);
    return { success: false, error: err.message };
  }
});

let kokoroTTSInstance = null;
async function getKokoro() {
  if (!kokoroTTSInstance) {
    const { KokoroTTS } = require("kokoro-js");
    kokoroTTSInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8" });
  }
  return kokoroTTSInstance;
}

function float32ToWav(samples, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return Buffer.from(buffer);
}

let activeSpeechProc = null;

ipcMain.handle("speak-native", async (_event, text) => {
  if (activeSpeechProc) {
    try { activeSpeechProc.kill(); } catch {}
    activeSpeechProc = null;
  }
  return new Promise((resolve) => {
    try {
      const scriptPath = path.join(__dirname, "sapi.js");
      const safeText = String(text || "").replace(/"/g, '""');
      activeSpeechProc = spawn("cscript", ["//nologo", scriptPath, safeText], {
        windowsHide: true,
      });
      activeSpeechProc.on("close", () => {
        activeSpeechProc = null;
        resolve({ success: true });
      });
      activeSpeechProc.on("error", (err) => {
        console.warn("[SAPI] Speech error:", err);
        activeSpeechProc = null;
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle("stop-native-speech", () => {
  if (activeSpeechProc) {
    try { activeSpeechProc.kill(); } catch {}
    activeSpeechProc = null;
  }
  return true;
});

ipcMain.handle("kokoro-tts", async (_event, text) => {
  // Return fallback: true to ensure instant, non-blocking native voice playback
  return { success: false, error: "Fast native speech preferred" };
});

// File Ingestion & Google Drive Upload
const knownDriveFileIds = new Set();
const myUploadedFileIds = new Set();
let isFirstDrivePoll = true;

ipcMain.handle("ingest-file", async (_event, fileArg) => {
  try {
    let filePath = typeof fileArg === "string" ? fileArg : fileArg?.path || "";
    let fileName =
      (typeof fileArg === "object" && fileArg?.name) ||
      (filePath ? path.basename(filePath) : "file");
    let fileBuffer = (typeof fileArg === "object" && fileArg?.buffer) || null;
    let fileSize = (typeof fileArg === "object" && fileArg?.size) || 0;

    const inboxDir = path.join(userDataDir, "inbox");
    if (!fs.existsSync(inboxDir)) {
      fs.mkdirSync(inboxDir, { recursive: true });
    }

    const safeName = fileName.replace(/[/\\?%*:|"<>]/g, "_");
    const destPath = path.join(inboxDir, `${Date.now()}_${safeName}`);

    let resolvedPath = filePath;
    let stats = null;

    if (filePath && fs.existsSync(filePath)) {
      try {
        stats = fs.statSync(filePath);
        fileSize = stats.size;
        fs.copyFileSync(filePath, destPath);
      } catch (err) {
        console.warn("[Ingest File] copyFileSync failed:", err);
      }
    } else if (filePath) {
      // Look in common user directories if a relative name was passed
      const baseName = path.basename(filePath);
      const home = os.homedir();
      const candidates = [
        path.join(home, "Desktop", baseName),
        path.join(home, "Downloads", baseName),
        path.join(home, "Pictures", "Screenshots", baseName),
        path.join(home, "Pictures", baseName),
        path.join(home, "Videos", baseName),
        path.join(home, "Documents", baseName),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          resolvedPath = cand;
          try {
            stats = fs.statSync(cand);
            fileSize = stats.size;
            fs.copyFileSync(cand, destPath);
          } catch (e) {}
          break;
        }
      }
    }

    // If file was not found on disk, but renderer passed arrayBuffer:
    if (!fs.existsSync(destPath) && fileBuffer) {
      try {
        const nodeBuffer = Buffer.from(fileBuffer);
        fs.writeFileSync(destPath, nodeBuffer);
        fileSize = nodeBuffer.length;
      } catch (e) {
        console.warn("[Ingest File] Buffer write failed:", e);
      }
    }

    const finalPath = fs.existsSync(destPath) ? destPath : (resolvedPath || filePath);

    const fileInfo = {
      name: fileName,
      path: finalPath,
      size: fileSize || 1024 * 1024 * 2,
      uploadedToDrive: false,
    };

    console.log(`[File Ingestion]: Successfully ingested ${fileName} (${(fileInfo.size / (1024 * 1024)).toFixed(2)} MB) at ${finalPath}`);

    // 1. Google Drive Upload: Try Google Account OAuth First (15GB quota), then Service Account
    const driveFolderId = activeSettings.gdriveFolderId || "1d-IQvgmZTBDcUkIy7f_kJHl2YCgc80CE";
    const ext = path.extname(fileName).toLowerCase();
    let mimeType = "application/octet-stream";
    if (ext === ".png") mimeType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".mp4") mimeType = "video/mp4";
    else if (ext === ".mov") mimeType = "video/quicktime";
    else if (ext === ".mkv") mimeType = "video/x-matroska";
    else if (ext === ".pdf") mimeType = "application/pdf";
    else if (ext === ".txt") mimeType = "text/plain";
    else if (ext === ".zip") mimeType = "application/zip";

    const oauth = activeSettings.googleOAuth;
    if (oauth && oauth.refreshToken && oauth.clientId && oauth.clientSecret) {
      try {
        console.log(`[Google Drive]: Uploading ${fileName} to Drive folder ${driveFolderId} via Google Account (${oauth.email || "user"})...`);
        const accessToken = await refreshOAuthAccessToken({
          clientId: oauth.clientId,
          clientSecret: oauth.clientSecret,
          refreshToken: oauth.refreshToken,
        });

        const driveResult = await uploadFileWithToken({
          filePath: finalPath,
          fileName,
          mimeType,
          folderId: driveFolderId,
          accessToken,
        });

        fileInfo.uploadedToDrive = true;
        fileInfo.driveUrl = driveResult.webViewLink || `https://drive.google.com/file/d/${driveResult.id}/view`;
        fileInfo.driveId = driveResult.id;
        myUploadedFileIds.add(driveResult.id);
        myUploadedFileIds.add(fileName);
        knownDriveFileIds.add(driveResult.id);
        knownDriveFileIds.add(fileName);

        console.log(`[Google Drive]: Upload successful via Google Account! File ID: ${driveResult.id}`);
      } catch (oauthErr) {
        console.error(`[Google Drive]: Google Account upload error:`, oauthErr);
      }
    }

    if (!fileInfo.uploadedToDrive) {
      const sa = loadServiceAccount();
      if (sa && driveFolderId) {
        try {
          console.log(`[Google Drive]: Uploading ${fileName} to Drive folder ${driveFolderId} using Service Account (${sa.client_email})...`);
          const driveResult = await uploadFileToDrive({
            filePath: finalPath,
            fileName,
            mimeType,
            folderId: driveFolderId,
            serviceAccount: sa,
          });

          fileInfo.uploadedToDrive = true;
          fileInfo.driveUrl = driveResult.webViewLink || `https://drive.google.com/file/d/${driveResult.id}/view`;
          fileInfo.driveId = driveResult.id;
          myUploadedFileIds.add(driveResult.id);
          myUploadedFileIds.add(fileName);
          knownDriveFileIds.add(driveResult.id);
          knownDriveFileIds.add(fileName);

          console.log(`[Google Drive]: Upload successful via Service Account! File ID: ${driveResult.id}`);
        } catch (driveErr) {
          console.error(`[Google Drive]: Service account upload error:`, driveErr);
        }
      }
    }

    // 2. Direct Cloud Relay Broadcast (Real-time partner sync)
    const shareBin = activeSettings.shareChannel || "coucou-badsha-ayzil";
    try {
      const uploadUrl = `https://filebin.net/${encodeURIComponent(shareBin)}/${encodeURIComponent(fileName)}`;
      console.log(`[Cloud Share]: Broadcasting ${fileName} to pair channel ${shareBin}...`);
      const fileBytes = fs.readFileSync(finalPath);
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "filename": fileName,
          "content-type": "application/octet-stream",
        },
        body: fileBytes,
      });
      if (res.ok) {
        fileInfo.uploadedToDrive = true;
        fileInfo.cloudUrl = uploadUrl;
        myUploadedFileIds.add(fileName);
        knownDriveFileIds.add(fileName);
        console.log(`[Cloud Share]: Successfully broadcast ${fileName} to pair channel ${shareBin}!`);
      }
    } catch (relayErr) {
      console.error(`[Cloud Share]: Relay upload error:`, relayErr);
    }

    // 3. Live Broadcast via Supabase Realtime (<50ms delivery to partner PC)
    try {
      await broadcastFileShared({
        id: fileInfo.driveId || fileName,
        name: fileName,
        size: fileInfo.size,
        driveUrl: fileInfo.driveUrl || "",
        driveId: fileInfo.driveId || "",
        senderName: activeSettings.userName || "Badsha",
        senderRole: activeSettings.userRole || "me",
      });
      console.log(`[Supabase Realtime]: Broadcasted ${fileName} to partner PC!`);
    } catch (sbErr) {
      console.warn("[Supabase Realtime]: Broadcast error:", sbErr.message);
    }

    return fileInfo;
  } catch (err) {
    console.error("Ingest file error:", err);
    const fileName = typeof fileArg === "string" ? path.basename(fileArg) : (fileArg?.name || "file");
    return {
      name: fileName,
      path: typeof fileArg === "string" ? fileArg : (fileArg?.path || fileName),
      size: 1024 * 1024 * 2,
      uploadedToDrive: false,
    };
  }
});

// Partner Drive & Cloud File Download
ipcMain.handle("download-drive-file", async (_event, fileInfo) => {
  try {
    const fileId = fileInfo.id;
    const fileName = fileInfo.name || "shared_file";
    const downloadsDir = path.join(os.homedir(), "Downloads");
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    let targetPath = path.join(downloadsDir, fileName);
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      targetPath = path.join(downloadsDir, `${base}_${Date.now()}${ext}`);
    }

    // Try Google Drive direct download if fileId is valid Google Drive ID
    const sa = loadServiceAccount();
    if (fileId && (!fileId.includes(".") || fileInfo.driveId)) {
      try {
        const actualId = fileInfo.driveId || fileId;
        console.log(`[Google Drive]: Downloading ${fileName} (ID: ${actualId}) from Drive...`);
        await downloadFileFromDrive({
          fileId: actualId,
          apiKey: activeSettings.gdriveApiKey,
          serviceAccount: sa,
          targetPath,
        });
        console.log(`[Google Drive]: File saved directly to ${targetPath}`);
        return { success: true, localPath: targetPath };
      } catch (gErr) {
        console.warn("[Google Drive]: Direct Drive download failed, attempting cloud fallback:", gErr.message);
      }
    }

    // Fallback: Cloud Relay Download
    const shareBin = activeSettings.shareChannel || "coucou-badsha-ayzil";
    let downloadUrl = fileInfo.downloadUrl;
    if (!downloadUrl) {
      downloadUrl = `https://filebin.net/${encodeURIComponent(shareBin)}/${encodeURIComponent(fileName)}`;
    }

    console.log(`[File Download]: Downloading ${fileName} from ${downloadUrl}...`);
    let res = await fetch(downloadUrl, {
      headers: { "User-Agent": "curl/8.0" },
    });
    if (!res.ok && fileInfo.webContentLink) {
      res = await fetch(fileInfo.webContentLink);
    }
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
    console.log(`[File Download]: File successfully written to ${targetPath}`);
    return { success: true, localPath: targetPath };
  } catch (err) {
    console.error("[File Download] Error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("select-service-account", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Google Service Account JSON Key",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const selectedPath = result.filePaths[0];
  try {
    const raw = fs.readFileSync(selectedPath, "utf-8");
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) {
      return { success: false, error: "Selected JSON is not a valid Google Service Account key (missing client_email or private_key)." };
    }

    fs.writeFileSync(serviceAccountPath, JSON.stringify(sa, null, 2), "utf-8");
    console.log(`[Service Account]: Successfully saved key for ${sa.client_email}`);
    return { success: true, email: sa.client_email };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-service-account-status", () => {
  const sa = loadServiceAccount();
  return {
    configured: !!sa,
    email: sa?.client_email || "",
  };
});

ipcMain.handle("open-path", (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
  } catch (e) {
    console.warn("Failed to open path:", e);
  }
  return false;
});

ipcMain.handle("google-oauth-start", async (_event, creds) => {
  try {
    const { clientId, clientSecret } = creds || {};
    if (!clientId || !clientSecret) {
      return { success: false, error: "Please enter or select your Client ID and Client Secret first." };
    }

    const { authUrl, serverStarted, completion } = startGoogleOAuthFlow({ clientId, clientSecret });
    await serverStarted;
    await shell.openExternal(authUrl);

    const result = await completion;
    if (result.success) {
      activeSettings.googleOAuth = {
        clientId,
        clientSecret,
        refreshToken: result.refreshToken,
        email: result.email,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(activeSettings, null, 2), "utf-8");
      console.log(`[Google OAuth]: Successfully connected as ${result.email}`);
      return { success: true, email: result.email };
    }
    return { success: false, error: "Failed to authorize" };
  } catch (err) {
    console.error("[Google OAuth Error]:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("google-oauth-disconnect", async () => {
  delete activeSettings.googleOAuth;
  fs.writeFileSync(settingsPath, JSON.stringify(activeSettings, null, 2), "utf-8");
  return { success: true };
});

ipcMain.handle("google-oauth-status", () => {
  const oauth = activeSettings.googleOAuth;
  return {
    connected: !!(oauth && oauth.refreshToken),
    email: oauth?.email || "",
    clientId: oauth?.clientId || "",
    clientSecret: oauth?.clientSecret || "",
  };
});

ipcMain.handle("select-oauth-client", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Google OAuth Client JSON (client_secret_*.json)",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf-8");
    const json = JSON.parse(raw);
    const client = json.installed || json.web;
    if (!client || !client.client_id || !client.client_secret) {
      return { success: false, error: "Invalid OAuth Client JSON. Must contain 'installed' or 'web' with client_id and client_secret." };
    }
    return {
      success: true,
      clientId: client.client_id,
      clientSecret: client.client_secret,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("test-drive-connection", async () => {
  const folderId = activeSettings.gdriveFolderId || "1d-IQvgmZTBDcUkIy7f_kJHl2YCgc80CE";
  const oauth = activeSettings.googleOAuth;
  const sa = loadServiceAccount();

  let readOk = false;
  let writeOk = false;
  let folderName = "";
  let saEmail = "";
  let method = "";
  let error = "";

  if (oauth && oauth.refreshToken && oauth.clientId && oauth.clientSecret) {
    method = "oauth";
    saEmail = oauth.email || "Google Account";
    try {
      const accessToken = await refreshOAuthAccessToken({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        refreshToken: oauth.refreshToken,
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,capabilities`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        readOk = true;
        folderName = data.name || "FILES SHARED";
        writeOk = !!data.capabilities?.canAddChildren;
      } else {
        error = `Folder access HTTP ${res.status}: Make sure folder "${folderId}" is accessible by ${oauth.email}.`;
      }
    } catch (e) {
      error = e.message;
    }
  } else if (sa) {
    method = "service_account";
    saEmail = sa.client_email || "";
    try {
      const token = await getAccessToken(sa);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,capabilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        readOk = true;
        folderName = data.name || "FILES SHARED";
        writeOk = !!data.capabilities?.canAddChildren;
      } else {
        error = `Folder access HTTP ${res.status}: Share folder "${folderId}" with ${sa.client_email} as Editor!`;
      }
    } catch (e) {
      error = e.message;
    }
  }

  return { readOk, writeOk, folderName, saEmail, method, error };
});

// Cloud Relay Polling Watcher (Instant Partner Sync)
let isFirstCloudPoll = true;
async function checkCloudShareForNewFiles() {
  try {
    const shareBin = activeSettings.shareChannel || "coucou-badsha-ayzil";
    const url = `https://filebin.net/${encodeURIComponent(shareBin)}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.files || !Array.isArray(data.files)) return;

    if (isFirstCloudPoll) {
      for (const f of data.files) {
        knownDriveFileIds.add(f.filename);
      }
      isFirstCloudPoll = false;
      return;
    }

    for (const f of data.files) {
      if (!knownDriveFileIds.has(f.filename)) {
        knownDriveFileIds.add(f.filename);

        if (!myUploadedFileIds.has(f.filename)) {
          console.log(`[Cloud Share]: Detected new partner file: ${f.filename} (${f.bytes} bytes)`);

          const isMe = (activeSettings.userRole || "me") === "me";
          const rawPartner = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
          const pName = rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1);
          if (Notification.isSupported()) {
            try {
              const notif = new Notification({
                title: `📁 New File from ${pName}`,
                body: `${f.filename} is ready to download!`,
              });
              notif.on("click", () => {
                if (overlayWin && !overlayWin.isDestroyed()) {
                  overlayWin.show();
                  overlayWin.focus();
                }
              });
              notif.show();
            } catch (ne) {
              console.warn("Notification error:", ne);
            }
          }

          if (overlayWin && !overlayWin.isDestroyed()) {
            if (isCollapsed) {
              isCollapsed = false;
              overlayWin.show();
            }

            overlayWin.webContents.send("incoming-file", {
              id: f.filename,
              name: f.filename,
              size: Number(f.bytes || 0),
              mimeType: f["content-type"],
              downloadUrl: `https://filebin.net/${encodeURIComponent(shareBin)}/${encodeURIComponent(f.filename)}`,
              partnerName: pName,
              time: f.created_at,
            });
          }
        }
      }
    }
  } catch (err) {
    // quiet poll
  }
}

// Google Drive Background Polling Watcher
async function checkDriveFolderForNewFiles() {
  const folderId = activeSettings.gdriveFolderId || "1d-IQvgmZTBDcUkIy7f_kJHl2YCgc80CE";
  const oauth = activeSettings.googleOAuth;
  const sa = loadServiceAccount();
  const apiKey = activeSettings.gdriveApiKey;

  let headers = {};
  let queryUrl = "";

  if (oauth && oauth.refreshToken && oauth.clientId && oauth.clientSecret) {
    try {
      const accessToken = await refreshOAuthAccessToken({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        refreshToken: oauth.refreshToken,
      });
      headers = { Authorization: `Bearer ${accessToken}` };
      queryUrl = `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,webContentLink,webViewLink,createdTime)&orderBy=createdTime+desc&pageSize=10`;
    } catch {}
  } else if (sa) {
    try {
      const token = await getAccessToken(sa);
      headers = { Authorization: `Bearer ${token}` };
      queryUrl = `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,webContentLink,webViewLink,createdTime)&orderBy=createdTime+desc&pageSize=10`;
    } catch {}
  } else if (apiKey) {
    queryUrl = `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,webContentLink,webViewLink,createdTime)&orderBy=createdTime+desc&pageSize=10&key=${apiKey}`;
  }

  if (!queryUrl) return;

  try {
    const res = await fetch(queryUrl, { headers });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.files || !Array.isArray(data.files)) return;

    if (isFirstDrivePoll) {
      for (const f of data.files) {
        knownDriveFileIds.add(f.id);
      }
      isFirstDrivePoll = false;
      return;
    }

    for (const f of data.files) {
      if (!knownDriveFileIds.has(f.id)) {
        knownDriveFileIds.add(f.id);

        if (!myUploadedFileIds.has(f.id)) {
          console.log(`[Drive Watcher] Detected new partner file: ${f.name} (${f.id})`);

          const isMe = (activeSettings.userRole || "me") === "me";
          const rawPartner = isMe ? (activeSettings.partnerName || "Ayzil") : (activeSettings.userName || "Badsha");
          const pName = rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1);
          if (Notification.isSupported()) {
            try {
              const notif = new Notification({
                title: `📁 New Drive File from ${pName}`,
                body: `${f.name} is ready in your shared folder!`,
              });
              notif.on("click", () => {
                if (overlayWin && !overlayWin.isDestroyed()) {
                  overlayWin.show();
                  overlayWin.focus();
                }
              });
              notif.show();
            } catch (ne) {
              console.warn("Notification error:", ne);
            }
          }

          if (overlayWin && !overlayWin.isDestroyed()) {
            if (isCollapsed) {
              isCollapsed = false;
              overlayWin.show();
            }

            overlayWin.webContents.send("incoming-file", {
              id: f.id,
              name: f.name,
              size: Number(f.size || 0),
              mimeType: f.mimeType,
              webContentLink: f.webContentLink,
              webViewLink: f.webViewLink,
              partnerName: pName,
              time: f.createdTime,
            });
          }
        }
      }
    }
  } catch (err) {
    // quiet poll
  }
}

setInterval(checkCloudShareForNewFiles, 8000);
setTimeout(checkCloudShareForNewFiles, 1500);

setInterval(checkDriveFolderForNewFiles, 12000);
setTimeout(checkDriveFolderForNewFiles, 3000);

// Schedule Management & Cross-PC Syncing
let lastLocalScheduleUpdate = Date.now();

async function syncScheduleToPartner() {
  // 1. Live WebSocket Broadcast via Supabase Realtime (<50ms latency)
  try {
    const isMe = (activeSettings.userRole || "me") === "me";
    const rawMe = isMe ? (activeSettings.userName || "Badsha") : (activeSettings.partnerName || "Ayzil");
    const currentUserName = rawMe.charAt(0).toUpperCase() + rawMe.slice(1);
    await broadcastScheduleUpdate({
      items: activeSchedule,
      senderName: currentUserName,
      senderRole: activeSettings.userRole || "me",
    });
  } catch (sbErr) {
    console.warn("[Supabase Realtime] Task broadcast error:", sbErr.message);
  }

  // 2. Fallback relay
  const shareBin = activeSettings.shareChannel || "coucou-badsha-ayzil";
  try {
    const uploadUrl = `https://filebin.net/${encodeURIComponent(shareBin)}/schedule_sync.json`;
    lastLocalScheduleUpdate = Date.now();
    const payload = JSON.stringify({
      updatedAt: lastLocalScheduleUpdate,
      updatedBy: activeSettings.userName || "User",
      items: activeSchedule,
    });
    await fetch(uploadUrl, {
      method: "POST",
      headers: { "filename": "schedule_sync.json", "content-type": "application/json" },
      body: payload,
    });
  } catch (err) {
    console.warn("[Schedule Sync] Broadcast error:", err.message);
  }
}

async function checkRemoteScheduleUpdates() {
  const shareBin = activeSettings.shareChannel || "coucou-badsha-ayzil";
  try {
    const url = `https://filebin.net/${encodeURIComponent(shareBin)}/schedule_sync.json`;
    const res = await fetch(url, { headers: { "User-Agent": "curl/8.0" } });
    if (!res.ok) return;
    const remote = await res.json();
    if (remote && remote.updatedAt && remote.updatedAt > lastLocalScheduleUpdate && Array.isArray(remote.items)) {
      if (remote.updatedBy !== (activeSettings.userName || "User")) {
        console.log(`[Schedule Sync] Received schedule update from ${remote.updatedBy}!`);
        lastLocalScheduleUpdate = remote.updatedAt;
        activeSchedule = remote.items;
        saveSchedule(activeSchedule);
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send("schedule-updated", activeSchedule);
        }
      }
    }
  } catch (e) {
    // quiet
  }
}

setInterval(checkRemoteScheduleUpdates, 7000);

ipcMain.handle("get-schedule", () => activeSchedule);

ipcMain.handle("save-schedule-item", (_event, item) => {
  const existingIndex = activeSchedule.findIndex((s) => s.id === item.id);
  if (existingIndex >= 0) {
    activeSchedule[existingIndex] = item;
  } else {
    activeSchedule.push(item);
  }
  saveSchedule(activeSchedule);
  syncScheduleToPartner();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("schedule-updated", activeSchedule);
  }
  return activeSchedule;
});

ipcMain.handle("delete-schedule-item", (_event, id) => {
  activeSchedule = activeSchedule.filter((s) => s.id !== id);
  saveSchedule(activeSchedule);
  syncScheduleToPartner();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("schedule-updated", activeSchedule);
  }
  return activeSchedule;
});

ipcMain.handle("toggle-schedule-item", (_event, id) => {
  const item = activeSchedule.find((s) => s.id === id);
  if (item) {
    item.completed = !item.completed;
    if (item.completed) item.completedAt = Date.now();
    saveSchedule(activeSchedule);
    syncScheduleToPartner();
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send("schedule-updated", activeSchedule);
    }
  }
  return activeSchedule;
});

// Secrets
ipcMain.handle("secret-set", (_event, { key, val }) => {
  activeSettings[key] = val;
  saveSettings(activeSettings);
  return true;
});

ipcMain.handle("secret-get", (_event, key) => activeSettings[key] || "");
ipcMain.handle("secret-clear", (_event, key) => {
  delete activeSettings[key];
  saveSettings(activeSettings);
  return true;
});

// App Lifecycle
app.whenReady().then(() => {
  setupTray();
  createOverlayWindow();
  startSupabaseSync();
  applyStartupMode(activeSettings.autostart);

  app.on("activate", () => {
    if (!overlayWin || overlayWin.isDestroyed()) {
      createOverlayWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Do not quit when windows are closed; keep companion alive in tray and top bar
});

process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]:", reason);
});
