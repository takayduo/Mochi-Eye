// Thin wrapper over Electron IPC (and fallback for browser preview).
import type { Settings } from "./state";

declare global {
  interface Window {
    electronAPI?: {
      boot(): Promise<BootInfo>;
      saveSettings(settings: Settings): Promise<boolean>;
      setCollapsed(collapsed: boolean): Promise<boolean>;
      setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): Promise<boolean>;
      setIslandRect(rect: { x: number; y: number; w: number; h: number }): Promise<boolean>;
      focusWindow(focused: boolean): Promise<boolean>;
      reposition(): Promise<boolean>;
      openUrl(url: string): Promise<boolean>;
      launchApp(nameOrPath: string): Promise<{ success: boolean; path?: string; error?: string }>;
      closeApp(nameOrPath: string): Promise<{ success: boolean; app?: string; notRunning?: boolean; error?: string }>;
      selectAppFile(): Promise<{ canceled: boolean; path?: string }>;
      openSettingsWindow(): Promise<boolean>;
      quit(): Promise<void>;
      log(msg: string): Promise<boolean>;

      chatSend(query: string, context: ChatContext | null): Promise<{ text: string }>;
      chatReset(): Promise<boolean>;
      transcribeAudio(audioBase64: string): Promise<{ success: boolean; text?: string; error?: string }>;
      kokoroTTS(text: string): Promise<{ success: boolean; base64?: string; error?: string }>;
      speakNative?(text: string): Promise<{ success: boolean; error?: string }>;
      ingestFile(fileData: string | DroppedFileInput): Promise<DroppedFile>;
      downloadDriveFile?(fileInfo: any): Promise<{ success: boolean; localPath?: string; error?: string }>;
      openPath?(path: string): Promise<boolean>;
      testDriveConnection?(): Promise<{ readOk: boolean; writeOk: boolean; folderName: string; saEmail: string; error?: string }>;
      selectServiceAccount?(): Promise<{ success: boolean; canceled?: boolean; email?: string; error?: string }>;
      getServiceAccountStatus?(): Promise<{ configured: boolean; email: string }>;
      googleOAuthStart?(creds: { clientId: string; clientSecret: string }): Promise<{ success: boolean; email?: string; error?: string }>;
      googleOAuthDisconnect?(): Promise<{ success: boolean }>;
      googleOAuthStatus?(): Promise<{ connected: boolean; email: string; clientId: string; clientSecret: string }>;
      selectOAuthClient?(): Promise<{ success: boolean; canceled?: boolean; clientId?: string; clientSecret?: string; error?: string }>;
      getPathForFile?(file: any): string;
      testSupabase?(creds: { url: string; key: string }): Promise<{ success: boolean; error?: string }>;

      getSchedule(): Promise<ScheduleItem[]>;
      saveScheduleItem(item: ScheduleItem): Promise<ScheduleItem[]>;
      deleteScheduleItem(id: string): Promise<ScheduleItem[]>;
      toggleScheduleItem(id: string): Promise<ScheduleItem[]>;

      getChatMessages?(): Promise<PartnerChatMessage[]>;
      sendChatMessage?(text: string | { text: string; isAiGenerated?: boolean }, isAiGenerated?: boolean): Promise<PartnerChatMessage>;
      markChatRead?(): Promise<boolean>;

      requestRemoteAccess?(): Promise<boolean>;
      respondRemoteAccess?(accepted: boolean): Promise<boolean>;
      sendRemoteSignal?(signal: any): Promise<boolean>;
      endRemoteAccess?(): Promise<boolean>;
      getPrimaryScreenSource?(): Promise<{ id: string; name: string; width: number; height: number } | null>;
      injectInput?(cmd: string): Promise<boolean>;

      secretSet(key: string, val: string): Promise<boolean>;
      secretGet(key: string): Promise<string>;
      secretClear(key: string): Promise<boolean>;

      on(channel: string, callback: (...args: any[]) => void): () => void;
    };
  }
}

export const IS_DESKTOP = typeof window !== "undefined" && !!window.electronAPI;
export const IS_TAURI = IS_DESKTOP; // For Coucou compatibility

export interface BootInfo {
  settings: Settings;
  schedule?: ScheduleItem[];
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  hookPath: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  assignee: "me" | "her";
  assignedBy: "me" | "her";
  completed: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface PartnerChatMessage {
  id: string;
  sender: string;
  recipient: string;
  text: string;
  timestamp: number;
  read: boolean;
  isAiGenerated?: boolean;
}

export interface ChatContext {
  kind: "file" | "window";
  name: string;
  path?: string;
  appName?: string;
  title?: string;
}

export interface DroppedFile {
  name: string;
  path: string;
  size: number;
  uploadedToDrive?: boolean;
  driveUrl?: string;
}

export interface HookStatus {
  installed: boolean;
  settingsPath: string;
  hookPath: string;
  hookReady: boolean;
}

export interface HookPreview {
  diff: string;
  backup: string;
  settingsPath: string;
  fingerprint: string;
}

export const Bridge = {
  boot: async (): Promise<BootInfo | null> => {
    if (window.electronAPI) return await window.electronAPI.boot();
    return {
      settings: {
        soundEnabled: true,
        soundVolume: 0.14,
        autoCloseInterval: 15,
        absenceInterval: 60,
        activeIntegrations: [],
        screen: "primary",
        autostart: false,
        hooksInstalled: false,
        model: "gemini-1.5-flash",
      } as any,
      screen: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
      version: "1.0.0-creator",
      hookPath: "",
    };
  },

  saveSettings: async (settings: Settings): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.saveSettings(settings);
    else localStorage.setItem("coucou_settings", JSON.stringify(settings));
  },

  setCollapsed: async (collapsed: boolean): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.setCollapsed(collapsed);
  },

  setIgnoreMouseEvents: async (ignore: boolean, options?: { forward?: boolean }): Promise<void> => {
    if (window.electronAPI?.setIgnoreMouseEvents) {
      await window.electronAPI.setIgnoreMouseEvents(ignore, options);
    }
  },

  setIslandRect: async (x: number, y: number, width: number, height: number): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.setIslandRect({ x, y, w: width, h: height });
  },

  focusWindow: async (focused: boolean): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.focusWindow(focused);
  },

  reposition: async (): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.reposition();
  },

  openUrl: async (url: string): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.openUrl(url);
    else window.open(url, "_blank");
  },

  openInVSCode: async (path: string | null): Promise<boolean> => {
    if (window.electronAPI) {
      const res = await window.electronAPI.launchApp(path || "code");
      return res.success;
    }
    return false;
  },

  launchApp: async (nameOrPath: string) => {
    if (window.electronAPI) return await window.electronAPI.launchApp(nameOrPath);
    return { success: false, error: "Not in desktop environment" };
  },

  closeApp: async (nameOrPath: string) => {
    if (window.electronAPI) return await window.electronAPI.closeApp(nameOrPath);
    return { success: false, error: "Not in desktop environment" };
  },

  selectAppFile: async () => {
    if (window.electronAPI) return await window.electronAPI.selectAppFile();
    return { canceled: true };
  },

  quit: async (): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.quit();
  },

  openSettingsWindow: async (): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.openSettingsWindow();
    else window.open("/settings.html", "_blank");
  },

  log: async (message: string): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.log(message);
    else console.log("[Bridge Log]:", message);
  },

  // ── AI & Chat ─────────────────────────────────────────────────────────────
  chatSend: async (query: string, context: ChatContext | null): Promise<{ text: string }> => {
    if (window.electronAPI) return await window.electronAPI.chatSend(query, context);
    return { text: `[Browser Preview]: You asked: "${query}". Please open in the desktop app for live AI generation!` };
  },

  chatReset: async (): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.chatReset();
  },

  transcribeAudio: async (audioBase64: string): Promise<{ success: boolean; text?: string; error?: string }> => {
    if (window.electronAPI) return await window.electronAPI.transcribeAudio(audioBase64);
    return { success: false, error: "Not in desktop environment" };
  },

  kokoroTTS: async (text: string): Promise<{ success: boolean; base64?: string; error?: string }> => {
    if (window.electronAPI) return await window.electronAPI.kokoroTTS(text);
    return { success: false, error: "Not in desktop environment" };
  },

  speakNative: async (text: string): Promise<{ success: boolean; error?: string }> => {
    if (window.electronAPI?.speakNative) return await window.electronAPI.speakNative(text);
    return { success: false, error: "Not in desktop environment" };
  },

  stopNativeSpeech: async (): Promise<boolean> => {
    if (window.electronAPI?.stopNativeSpeech) return await window.electronAPI.stopNativeSpeech();
    return true;
  },

  ingestFile: async (fileData: string | DroppedFileInput): Promise<DroppedFile> => {
    if (window.electronAPI) return await window.electronAPI.ingestFile(fileData);
    const name = typeof fileData === "string" ? fileData.split(/[\\/]/).pop() || "file" : fileData.name;
    const path = typeof fileData === "string" ? fileData : fileData.path || name;
    return { name, path, size: 1024 * 1024 * 2 };
  },

  downloadDriveFile: async (fileInfo: any): Promise<{ success: boolean; localPath?: string; error?: string }> => {
    if (window.electronAPI?.downloadDriveFile) return await window.electronAPI.downloadDriveFile(fileInfo);
    return { success: false, error: "Desktop bridge unavailable" };
  },

  openPath: async (filePath: string): Promise<boolean> => {
    if (window.electronAPI?.openPath) return await window.electronAPI.openPath(filePath);
    return false;
  },

  testDriveConnection: async (): Promise<{ readOk: boolean; writeOk: boolean; folderName: string; saEmail: string; error?: string }> => {
    if (window.electronAPI?.testDriveConnection) return await window.electronAPI.testDriveConnection();
    return { readOk: false, writeOk: false, folderName: "", saEmail: "", error: "Desktop bridge unavailable" };
  },

  selectServiceAccount: async (): Promise<{ success: boolean; canceled?: boolean; email?: string; error?: string }> => {
    if (window.electronAPI?.selectServiceAccount) return await window.electronAPI.selectServiceAccount();
    return { success: false, error: "Desktop bridge unavailable" };
  },

  getServiceAccountStatus: async (): Promise<{ configured: boolean; email: string }> => {
    if (window.electronAPI?.getServiceAccountStatus) return await window.electronAPI.getServiceAccountStatus();
    return { configured: false, email: "" };
  },

  googleOAuthStart: async (creds: { clientId: string; clientSecret: string }): Promise<{ success: boolean; email?: string; error?: string }> => {
    if (window.electronAPI?.googleOAuthStart) return await window.electronAPI.googleOAuthStart(creds);
    return { success: false, error: "Desktop bridge unavailable" };
  },

  googleOAuthDisconnect: async (): Promise<{ success: boolean }> => {
    if (window.electronAPI?.googleOAuthDisconnect) return await window.electronAPI.googleOAuthDisconnect();
    return { success: false };
  },

  googleOAuthStatus: async (): Promise<{ connected: boolean; email: string; clientId: string; clientSecret: string }> => {
    if (window.electronAPI?.googleOAuthStatus) return await window.electronAPI.googleOAuthStatus();
    return { connected: false, email: "", clientId: "", clientSecret: "" };
  },

  selectOAuthClient: async (): Promise<{ success: boolean; canceled?: boolean; clientId?: string; clientSecret?: string; error?: string }> => {
    if (window.electronAPI?.selectOAuthClient) return await window.electronAPI.selectOAuthClient();
    return { success: false, error: "Desktop bridge unavailable" };
  },

  testSupabase: async (creds: { url: string; key: string }): Promise<{ success: boolean; error?: string }> => {
    if (window.electronAPI?.testSupabase) return await window.electronAPI.testSupabase(creds);
    return { success: false, error: "Desktop bridge unavailable" };
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  getSchedule: async (): Promise<ScheduleItem[]> => {
    if (window.electronAPI) return await window.electronAPI.getSchedule();
    return [];
  },

  saveScheduleItem: async (item: ScheduleItem): Promise<ScheduleItem[]> => {
    if (window.electronAPI) return await window.electronAPI.saveScheduleItem(item);
    return [];
  },

  deleteScheduleItem: async (id: string): Promise<ScheduleItem[]> => {
    if (window.electronAPI) return await window.electronAPI.deleteScheduleItem(id);
    return [];
  },

  toggleScheduleItem: async (id: string): Promise<ScheduleItem[]> => {
    if (window.electronAPI) return await window.electronAPI.toggleScheduleItem(id);
    return [];
  },

  // ── Live Partner Chat ─────────────────────────────────────────────────────
  getChatMessages: async (): Promise<PartnerChatMessage[]> => {
    if (window.electronAPI?.getChatMessages) return await window.electronAPI.getChatMessages();
    return [];
  },

  sendChatMessage: async (text: string, isAiGenerated = false): Promise<PartnerChatMessage | null> => {
    if (window.electronAPI?.sendChatMessage) {
      return await window.electronAPI.sendChatMessage(text, isAiGenerated);
    }
    return null;
  },

  markChatRead: async (): Promise<boolean> => {
    if (window.electronAPI?.markChatRead) return await window.electronAPI.markChatRead();
    return false;
  },

  // ── Remote Access (Mochi Eye Co-Pilot) ───────────────────────────────────────
  requestRemoteAccess: async (): Promise<boolean> => {
    if (window.electronAPI?.requestRemoteAccess) return await window.electronAPI.requestRemoteAccess();
    return false;
  },

  respondRemoteAccess: async (accepted: boolean, extra?: any): Promise<boolean> => {
    if (window.electronAPI?.respondRemoteAccess) return await window.electronAPI.respondRemoteAccess(accepted, extra);
    return false;
  },

  sendRemoteSignal: async (signal: any): Promise<boolean> => {
    if (window.electronAPI?.sendRemoteSignal) return await window.electronAPI.sendRemoteSignal(signal);
    return false;
  },

  endRemoteAccess: async (): Promise<boolean> => {
    if (window.electronAPI?.endRemoteAccess) return await window.electronAPI.endRemoteAccess();
    return false;
  },

  getPrimaryScreenSource: async (): Promise<{ id: string; name: string; width: number; height: number } | null> => {
    if (window.electronAPI?.getPrimaryScreenSource) return await window.electronAPI.getPrimaryScreenSource();
    return null;
  },

  injectInput: async (cmd: string): Promise<boolean> => {
    if (window.electronAPI?.injectInput) return await window.electronAPI.injectInput(cmd);
    return false;
  },

  // ── Secrets & Keys ────────────────────────────────────────────────────────
  secretPresent: async (key: string): Promise<boolean> => {
    if (window.electronAPI) {
      const val = await window.electronAPI.secretGet(key);
      return !!val;
    }
    return !!localStorage.getItem("secret_" + key);
  },

  secretSet: async (key: string, value: string): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.secretSet(key, value);
    else localStorage.setItem("secret_" + key, value);
  },

  secretClear: async (key: string): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.secretClear(key);
    else localStorage.removeItem("secret_" + key);
  },

  // Coucou hook stubs for backward compatibility
  hooksStatus: async (): Promise<HookStatus> => ({
    installed: false,
    settingsPath: "",
    hookPath: "",
    hookReady: true,
  }),
  hooksPreview: async (_install: boolean): Promise<HookPreview> => ({
    diff: "",
    backup: "",
    settingsPath: "",
    fingerprint: "",
  }),
  hooksApply: async (_install: boolean, _fingerprint: string): Promise<string> => "ok",
  approvalDecision: async (_requestId: string, _decision: "allow" | "deny") => {},
  approvalAck: async (_requestId: string) => {},
  approvalDecline: async (_requestId: string) => {},

  // Coucou integration stubs
  refreshIntegration: async (_id: string) => {},
  openN8n: async () => {},
  setPaused: async (_paused: boolean) => {},
};

export interface DroppedFileInput {
  path?: string;
  name: string;
  buffer?: ArrayBuffer;
  size?: number;
}

export interface DragDropEvent {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
  files?: DroppedFileInput[];
  x?: number;
  y?: number;
}

export async function onDragDrop(handler: (e: DragDropEvent) => void) {
  let dragCount = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    dragCount++;
    handler({ type: "enter", x: e.clientX, y: e.clientY });
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    handler({ type: "over", x: e.clientX, y: e.clientY });
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCount--;
    if (dragCount <= 0) {
      dragCount = 0;
      handler({ type: "leave" });
    }
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCount = 0;
    const dtFiles = e.dataTransfer?.files;
    const paths: string[] = [];
    const files: DroppedFileInput[] = [];

    if (dtFiles && dtFiles.length > 0) {
      for (let i = 0; i < dtFiles.length; i++) {
        const f = dtFiles[i];
        let p = "";
        if (window.electronAPI?.getPathForFile) {
          try {
            p = window.electronAPI.getPathForFile(f);
          } catch (err) {
            console.warn("getPathForFile error:", err);
          }
        }
        if (!p) {
          p = (f as any).path || "";
        }
        if (p) paths.push(p);

        let buf: ArrayBuffer | undefined = undefined;
        try {
          // If no local disk path was obtained, read arrayBuffer so ingestion never fails
          if (!p || !window.electronAPI) {
            buf = await f.arrayBuffer();
          }
        } catch (readErr) {
          console.warn("Could not read file buffer:", readErr);
        }

        files.push({
          path: p || f.name,
          name: f.name || (p ? p.split(/[\\/]/).pop() || "file" : "file"),
          buffer: buf,
          size: f.size || 0,
        });
      }
    }

    handler({ type: "drop", paths, files, x: e.clientX, y: e.clientY });
  });
  return () => {};
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (window.electronAPI) {
    return window.electronAPI.on(name, handler);
  }
  return () => {};
}
