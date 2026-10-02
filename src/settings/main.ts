// Settings window for Coucou Creator Companion
import "./settings.css";
import { Bridge } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import { h, clear } from "../views/dom";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "1.0.0-creator";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

// ── AI Engine Section ─────────────────────────────────────────────────────────

function aiSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(true), h("span", { text: "AI Models & API Keys" })),
    body
  );

  const providerSelect = h("select", {}) as HTMLSelectElement;
  providerSelect.append(
    h("option", { value: "gemini", text: "Google Gemini (Free API Key)" }),
    h("option", { value: "openrouter", text: "OpenRouter (Free Top Models)" }),
    h("option", { value: "groq", text: "Groq (Lightning Fast LPUs - Free Key)" })
  );
  providerSelect.value = settings.aiProvider === "grok" ? "groq" : (settings.aiProvider || "gemini");
  providerSelect.addEventListener("change", () => {
    settings.aiProvider = providerSelect.value as any;
    void save();
    draw();
  });

  function draw() {
    clear(body);

    body.append(
      h("div", {
        class: "hint",
        text: "Select your active AI provider and add your API keys. Mochi will answer schedule questions, execute commands, and launch desktop apps for both of you.",
      }),
      h("div", { class: "row" }, h("label", { text: "Active Provider" }), providerSelect)
    );

    // 1. Gemini
    const geminiInput = h("input", {
      type: "password",
      placeholder: settings.geminiApiKey ? "•••••••••••• (saved)" : "AIzaSy...",
      value: "",
    }) as HTMLInputElement;
    const geminiSave = h("button", { class: "primary", text: "Save" });
    const geminiStatus = statusDot(!!settings.geminiApiKey);

    geminiSave.addEventListener("click", async () => {
      const val = geminiInput.value.trim();
      if (val) {
        settings.geminiApiKey = val;
        geminiInput.value = "";
        geminiInput.placeholder = "•••••••••••• (saved)";
        geminiStatus.style.background = "#22c55e";
        await save();
      }
    });

    const geminiModelSelect = h("select", { style: "flex:1 1 auto;min-width:0" }) as HTMLSelectElement;
    geminiModelSelect.append(
      h("option", { value: "gemini-2.5-flash", text: "gemini-2.5-flash (Recommended — High-Speed & 100% Active)" }),
      h("option", { value: "gemini-flash-latest", text: "gemini-flash-latest (Always Points to Latest Stable Flash)" }),
      h("option", { value: "gemini-2.5-flash-lite", text: "gemini-2.5-flash-lite (Ultra-Low Latency Free Tier)" }),
      h("option", { value: "gemini-3.5-flash", text: "gemini-3.5-flash (Next-Gen Multimodal)" }),
      h("option", { value: "gemini-2.5-pro", text: "gemini-2.5-pro (Deep Reasoning & Analysis)" }),
      h("option", { value: "gemini-pro-latest", text: "gemini-pro-latest (Latest Pro Model)" })
    );
    geminiModelSelect.value = settings.geminiModel || "gemini-2.5-flash";
    geminiModelSelect.addEventListener("change", () => {
      settings.geminiModel = geminiModelSelect.value;
      void save();
    });

    // 2. OpenRouter
    const openrouterInput = h("input", {
      type: "password",
      placeholder: settings.openrouterApiKey ? "•••••••••••• (saved)" : "sk-or-v1-...",
      value: "",
    }) as HTMLInputElement;
    const openrouterSave = h("button", { class: "primary", text: "Save" });
    const openrouterStatus = statusDot(!!settings.openrouterApiKey);

    openrouterSave.addEventListener("click", async () => {
      const val = openrouterInput.value.trim();
      if (val) {
        settings.openrouterApiKey = val;
        openrouterInput.value = "";
        openrouterInput.placeholder = "•••••••••••• (saved)";
        openrouterStatus.style.background = "#22c55e";
        await save();
      }
    });

    const openrouterModelSelect = h("select", { style: "flex:1 1 auto;min-width:0" }) as HTMLSelectElement;
    openrouterModelSelect.append(
      h("option", { value: "meta-llama/llama-3.3-70b-instruct:free", text: "meta-llama/llama-3.3-70b-instruct:free (Recommended 70B)" }),
      h("option", { value: "qwen/qwen3.8-27b:free", text: "qwen/qwen3.8-27b:free (Fast 27B Free)" }),
      h("option", { value: "nvidia/nemotron-3.5-lightning:free", text: "nvidia/nemotron-3.5-lightning:free (NVIDIA Lightning Free)" }),
      h("option", { value: "liquid/lfm-2.5-2.6b:free", text: "liquid/lfm-2.5-2.6b:free (Ultra Fast Free)" })
    );
    openrouterModelSelect.value = settings.openrouterModel || "meta-llama/llama-3.3-70b-instruct:free";
    openrouterModelSelect.addEventListener("change", () => {
      settings.openrouterModel = openrouterModelSelect.value;
      void save();
    });

    // 3. Groq (GroqCloud LPUs)
    const groqInput = h("input", {
      type: "password",
      placeholder: (settings.groqApiKey || settings.grokApiKey) ? "•••••••••••• (saved)" : "gsk_...",
      value: "",
    }) as HTMLInputElement;
    const groqSave = h("button", { class: "primary", text: "Save" });
    const groqStatus = statusDot(!!(settings.groqApiKey || settings.grokApiKey));

    groqSave.addEventListener("click", async () => {
      const val = groqInput.value.trim();
      if (val) {
        settings.groqApiKey = val;
        groqInput.value = "";
        groqInput.placeholder = "•••••••••••• (saved)";
        groqStatus.style.background = "#22c55e";
        await save();
      }
    });

    const groqModelSelect = h("select", { style: "flex:1 1 auto;min-width:0" }) as HTMLSelectElement;
    groqModelSelect.append(
      h("option", { value: "openai/gpt-oss-120b", text: "openai/gpt-oss-120b (Recommended — Top 120B on Groq LPUs, 0.2s)" }),
      h("option", { value: "openai/gpt-oss-20b", text: "openai/gpt-oss-20b (Fast 20B on Groq LPUs)" }),
      h("option", { value: "qwen/qwen3.8-27b", text: "qwen/qwen3.8-27b (Qwen 3.8 27B on Groq)" }),
      h("option", { value: "allam-2-7b", text: "allam-2-7b (Allam 7B on Groq)" })
    );
    groqModelSelect.value = settings.groqModel || "openai/gpt-oss-120b";
    groqModelSelect.addEventListener("change", () => {
      settings.groqModel = groqModelSelect.value;
      void save();
    });


    body.append(
      h("div", { class: "group-title", text: "Google Gemini (Free Tier)" }),
      h("div", { class: "row" }, h("label", { text: "API Key" }), geminiInput, geminiSave, geminiStatus),
      h("div", { class: "row" }, h("label", { text: "Free Model" }), geminiModelSelect),

      h("div", { class: "group-title", text: "OpenRouter (Free Models)" }),
      h("div", { class: "row" }, h("label", { text: "API Key" }), openrouterInput, openrouterSave, openrouterStatus),
      h("div", { class: "row" }, h("label", { text: "Free Model" }), openrouterModelSelect),

      h("div", { class: "group-title", text: "Groq (Free LPU API Key)" }),
      h("div", { class: "row" }, h("label", { text: "API Key" }), groqInput, groqSave, groqStatus),
      h("div", { class: "row" }, h("label", { text: "Free Model" }), groqModelSelect)
    );
  }

  draw();
  return section;
}

// ── Couple Identity Section ───────────────────────────────────────────────────

function coupleSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(true), h("span", { text: "Creator Couple Profile" })),
    body
  );

  const roleMe = h("button", {
    class: settings.userRole === "me" ? "btn primary" : "btn secondary",
    text: "This is My PC (Me 👤)",
  });
  const roleHer = h("button", {
    class: settings.userRole === "her" ? "btn primary" : "btn secondary",
    text: "This is Her PC (Her 💖)",
  });

  roleMe.addEventListener("click", () => {
    settings.userRole = "me";
    roleMe.className = "btn primary";
    roleHer.className = "btn secondary";
    void save();
  });

  roleHer.addEventListener("click", () => {
    settings.userRole = "her";
    roleMe.className = "btn secondary";
    roleHer.className = "btn primary";
    void save();
  });

  const userNameInput = h("input", {
    type: "text",
    value: settings.userName || "Badsha",
    placeholder: "e.g. Badsha",
  }) as HTMLInputElement;
  const saveUserName = () => {
    settings.userName = userNameInput.value.trim() || "Badsha";
    void save();
  };
  userNameInput.addEventListener("change", saveUserName);
  userNameInput.addEventListener("blur", saveUserName);

  const partnerNameInput = h("input", {
    type: "text",
    value: settings.partnerName || "Ayzil",
    placeholder: "e.g. Ayzil",
  }) as HTMLInputElement;
  const savePartnerName = () => {
    settings.partnerName = partnerNameInput.value.trim() || "Ayzil";
    void save();
  };
  partnerNameInput.addEventListener("change", savePartnerName);
  partnerNameInput.addEventListener("blur", savePartnerName);

  body.append(
    h("div", {
      class: "hint",
      text: "Configure couple identity. Keep Creator and Partner names the same on both computers, then simply select 'This is My PC (Me 👤)' on your computer and 'This is Her PC (Her 💖)' on her computer.",
    }),
    h("div", { class: "row", style: "gap:10px" }, roleMe, roleHer),
    h("div", { class: "row" }, h("label", { text: "Creator Name (Me 👤)" }), userNameInput),
    h("div", { class: "row" }, h("label", { text: "Partner Name (Her 💖)" }), partnerNameInput)
  );

  return section;
}

// ── Supabase Live Realtime PC-to-PC Sync ────────────────────────────────────

function supabaseSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const hasConfig = !!(settings.syncUrl && settings.syncApiKey);
  const statusDotEl = statusDot(hasConfig);
  const section = h(
    "section",
    {},
    h("h2", {}, statusDotEl, h("span", { text: "Live PC-to-PC Sync (Supabase Realtime)" })),
    body
  );

  const urlInput = h("input", {
    type: "text",
    value: settings.syncUrl || "",
    placeholder: "https://your-project-id.supabase.co",
    style: "flex:1 1 auto;font-size:12px;",
  }) as HTMLInputElement;

  const keyInput = h("input", {
    type: "password",
    value: "",
    placeholder: settings.syncApiKey ? "•••••••••••• (saved anon key)" : "eyJhbGciOiJIUzI1NiIsInR5cCI...",
    style: "flex:1 1 auto;font-size:12px;",
  }) as HTMLInputElement;

  const testBtn = h("button", {
    class: "secondary",
    style: "font-size:12px;padding:6px 14px;",
    text: "🔍 Test Connection",
  });

  const saveBtn = h("button", {
    class: "primary",
    style: "font-size:12px;padding:6px 16px;background:#22c55e;color:#000;font-weight:600;",
    text: "💾 Save & Connect",
  });

  const statusMsg = h("div", {
    class: "path",
    style: "font-size:12px;font-weight:500;padding:4px 0;",
    text: hasConfig ? "Configured — Ready for live synchronization" : "Not configured yet",
  });

  saveBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    if (url) settings.syncUrl = url;
    if (key) {
      settings.syncApiKey = key;
      keyInput.value = "";
      keyInput.placeholder = "•••••••••••• (saved anon key)";
    }
    await save();
    statusMsg.textContent = "Saved settings! Testing connection...";
    statusMsg.style.color = "var(--ink)";
    runTest();
  });

  async function runTest() {
    const url = urlInput.value.trim() || settings.syncUrl;
    const key = keyInput.value.trim() || settings.syncApiKey;
    if (!url || !key) {
      statusMsg.textContent = "Please enter both Supabase Project URL and Anon Key.";
      statusMsg.style.color = "#f4505e";
      statusDotEl.style.background = "#f4505e";
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = "Testing...";
    statusMsg.textContent = "Connecting to Supabase...";
    statusMsg.style.color = "var(--dim)";

    try {
      const res = await Bridge.testSupabase({ url, key });
      if (res && res.success) {
        statusMsg.textContent = "🟢 Connected! Supabase WebSockets active (<50ms latency).";
        statusMsg.style.color = "#22c55e";
        statusDotEl.style.background = "#22c55e";
      } else {
        statusMsg.textContent = `🔴 Connection failed: ${res?.error || "Unknown error"}`;
        statusMsg.style.color = "#f4505e";
        statusDotEl.style.background = "#f4505e";
      }
    } catch (err: any) {
      statusMsg.textContent = `🔴 Error: ${err.message || err}`;
      statusMsg.style.color = "#f4505e";
      statusDotEl.style.background = "#f4505e";
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = "🔍 Test Connection";
    }
  }

  testBtn.addEventListener("click", () => void runTest());

  // Quick 2-Minute Setup Guide card
  const guideCard = h(
    "div",
    {
      style:
        "background:rgba(255,255,255,0.03);border:1px solid var(--hairline);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;margin-top:6px;",
    },
    h(
      "div",
      { style: "font-weight:600;font-size:12.5px;color:var(--ink);display:flex;align-items:center;gap:6px;" },
      h("span", { text: "⚡ 2-Minute Free Supabase Setup Guide" })
    ),
    h(
      "div",
      { style: "font-size:12px;color:var(--dim);line-height:1.6;" },
      h("div", { text: "1. Go to supabase.com (100% Free, no credit card required) and click 'Start your project'." }),
      h("div", { text: "2. Click 'New project', name it 'Coucou', set any password, and select your nearest region." }),
      h("div", { text: "3. In your dashboard, click ⚙️ Project Settings (bottom-left) ➔ API." }),
      h("div", { text: "4. Copy the Project URL and anon public Key, paste them above, and click 'Save & Connect'." }),
      h("div", {
        style: "color:#22c55e;margin-top:4px;font-weight:500;",
        text: "✓ Done! Tasks and incoming files will now synchronize between both PCs in real time (<100ms) with presence detection.",
      })
    )
  );

  body.append(
    h("div", {
      class: "hint",
      text: "Supabase Realtime provides live sub-50ms WebSockets between Badsha and Ayzil's PCs. When either of you adds or checks a task, or shares a file, the changes sync instantly without any local network or port forwarding needed.",
    }),
    h("div", { class: "row" }, h("label", { text: "Project URL" }), urlInput),
    h("div", { class: "row" }, h("label", { text: "Anon Public Key" }), keyInput),
    h("div", { class: "row", style: "gap:10px;margin-top:4px;" }, saveBtn, testBtn),
    statusMsg,
    guideCard
  );

  return section;
}

// ── Instant Pair Sharing & Google Drive ──────────────────────────────────────

function cloudSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(true), h("span", { text: "Pair File Sharing & Google Drive" })),
    body
  );

  const channelInput = h("input", {
    type: "text",
    value: settings.shareChannel || "coucou-badsha-ayzil",
    placeholder: "Pair Channel Name...",
  }) as HTMLInputElement;

  const channelSave = h("button", { class: "primary", text: "Save" });
  const channelStatus = statusDot(true);

  channelSave.addEventListener("click", async () => {
    const val = channelInput.value.trim() || "coucou-badsha-ayzil";
    settings.shareChannel = val;
    channelInput.value = val;
    await save();
  });

  const folderInput = h("input", {
    type: "text",
    value: settings.gdriveFolderId || "1d-IQvgmZTBDcUkIy7f_kJHl2YCgc80CE",
    placeholder: "Drive Folder ID...",
  }) as HTMLInputElement;

  const folderSave = h("button", { class: "primary", text: "Save" });
  const folderStatus = statusDot(!!settings.gdriveFolderId);

  folderSave.addEventListener("click", async () => {
    let val = folderInput.value.trim();
    const match = val.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) val = match[1];
    settings.gdriveFolderId = val;
    folderInput.value = val;
    folderStatus.style.background = val ? "#22c55e" : "#f4505e";
    await save();
  });

  const openFolderBtn = h("button", {
    class: "secondary",
    style: "font-size:12px;padding:6px 12px;",
    text: "Open Drive Folder ↗",
    onclick: () => {
      const fid = settings.gdriveFolderId || "1d-IQvgmZTBDcUkIy7f_kJHl2YCgc80CE";
      void Bridge.openUrl(`https://drive.google.com/drive/folders/${fid}`);
    },
  });

  // Google OAuth Elements
  const oauthStatusDot = statusDot(false);
  const oauthStatusText = h("span", {
    style: "font-size:12px;font-weight:500;color:var(--dim);word-break:break-all;",
    text: "Checking Google Account...",
  });

  const clientIdInput = h("input", {
    type: "text",
    placeholder: "Client ID (.apps.googleusercontent.com)",
    style: "flex:1 1 auto;font-size:11.5px;",
  }) as HTMLInputElement;

  const clientSecretInput = h("input", {
    type: "password",
    placeholder: "Client Secret",
    style: "width:180px;font-size:11.5px;",
  }) as HTMLInputElement;

  const selectOAuthJsonBtn = h("button", {
    class: "secondary",
    style: "font-size:12px;padding:6px 12px;",
    text: "📂 Load client_secret.json",
  });

  const connectOAuthBtn = h("button", {
    class: "primary",
    style: "font-size:12px;padding:6px 16px;background:#22c55e;color:#000;font-weight:600;",
    text: "🔗 Sign In with Google",
  });

  const disconnectOAuthBtn = h("button", {
    class: "danger",
    style: "display:none;font-size:11.5px;padding:4px 10px;",
    text: "Disconnect",
  });

  const testBtn = h("button", {
    class: "secondary",
    style: "font-size:12px;padding:6px 12px;",
    text: "🔍 Test Drive Connection",
  });

  const testFeedback = h("div", {
    style: "display:none;font-size:12px;padding:8px 12px;border-radius:6px;line-height:1.45;",
  });

  async function updateOAuthStatus() {
    try {
      const status = await Bridge.googleOAuthStatus();
      if (status.connected && status.email) {
        oauthStatusDot.style.background = "#22c55e";
        oauthStatusText.textContent = `Connected: ${status.email} (15 GB Storage)`;
        oauthStatusText.style.color = "#22c55e";
        connectOAuthBtn.style.display = "none";
        disconnectOAuthBtn.style.display = "inline-block";
        clientIdInput.style.display = "none";
        clientSecretInput.style.display = "none";
        selectOAuthJsonBtn.style.display = "none";
      } else {
        oauthStatusDot.style.background = "#9398a1";
        oauthStatusText.textContent = "Google Account not connected";
        oauthStatusText.style.color = "var(--dim)";
        connectOAuthBtn.style.display = "inline-block";
        disconnectOAuthBtn.style.display = "none";
        clientIdInput.style.display = "block";
        clientSecretInput.style.display = "block";
        selectOAuthJsonBtn.style.display = "inline-block";
        if (status.clientId) clientIdInput.value = status.clientId;
        if (status.clientSecret) clientSecretInput.value = status.clientSecret;
      }
    } catch {
      oauthStatusDot.style.background = "#9398a1";
      oauthStatusText.textContent = "OAuth status unavailable";
    }
  }

  void updateOAuthStatus();

  selectOAuthJsonBtn.addEventListener("click", async () => {
    testFeedback.style.display = "none";
    const res = await Bridge.selectOAuthClient();
    if (res.canceled) return;
    if (res.success && res.clientId && res.clientSecret) {
      clientIdInput.value = res.clientId;
      clientSecretInput.value = res.clientSecret;
      testFeedback.style.display = "block";
      testFeedback.style.background = "rgba(34,197,94,0.12)";
      testFeedback.style.border = "1px solid rgba(34,197,94,0.3)";
      testFeedback.style.color = "#22c55e";
      testFeedback.textContent = "✅ Loaded OAuth Client JSON! Click 'Sign In with Google' below to authorize.";
    } else if (res.error) {
      testFeedback.style.display = "block";
      testFeedback.style.background = "rgba(244,80,94,0.12)";
      testFeedback.style.border = "1px solid rgba(244,80,94,0.3)";
      testFeedback.style.color = "#f4505e";
      testFeedback.textContent = `❌ ${res.error}`;
    }
  });

  connectOAuthBtn.addEventListener("click", async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();
    if (!clientId || !clientSecret) {
      testFeedback.style.display = "block";
      testFeedback.style.background = "rgba(244,80,94,0.12)";
      testFeedback.style.border = "1px solid rgba(244,80,94,0.3)";
      testFeedback.style.color = "#f4505e";
      testFeedback.textContent = "Please select your OAuth client JSON or enter Client ID & Secret first.";
      return;
    }

    testFeedback.style.display = "block";
    testFeedback.style.background = "rgba(255,255,255,0.06)";
    testFeedback.style.border = "1px solid rgba(255,255,255,0.1)";
    testFeedback.style.color = "var(--ink)";
    testFeedback.textContent = "Browser opened for Google sign in. Authorize with your account...";

    connectOAuthBtn.setAttribute("disabled", "true");
    const res = await Bridge.googleOAuthStart({ clientId, clientSecret });
    connectOAuthBtn.removeAttribute("disabled");

    if (res.success) {
      await updateOAuthStatus();
      testFeedback.style.background = "rgba(34,197,94,0.12)";
      testFeedback.style.border = "1px solid rgba(34,197,94,0.3)";
      testFeedback.style.color = "#22c55e";
      testFeedback.textContent = `🎉 Connected! Files dropped on Mochi will upload directly to your Drive as ${res.email}.`;
    } else {
      testFeedback.style.background = "rgba(244,80,94,0.12)";
      testFeedback.style.border = "1px solid rgba(244,80,94,0.3)";
      testFeedback.style.color = "#f4505e";
      testFeedback.textContent = `❌ Authorization failed: ${res.error || "Unknown error"}`;
    }
  });

  disconnectOAuthBtn.addEventListener("click", async () => {
    await Bridge.googleOAuthDisconnect();
    await updateOAuthStatus();
    testFeedback.style.display = "none";
  });

  testBtn.addEventListener("click", async () => {
    testBtn.setAttribute("disabled", "true");
    testFeedback.style.display = "block";
    testFeedback.style.background = "rgba(255,255,255,0.06)";
    testFeedback.style.border = "1px solid rgba(255,255,255,0.1)";
    testFeedback.style.color = "var(--ink)";
    testFeedback.textContent = "Testing Drive folder access...";

    try {
      const result = await Bridge.testDriveConnection();
      if (result.readOk && result.writeOk) {
        testFeedback.style.background = "rgba(34,197,94,0.12)";
        testFeedback.style.border = "1px solid rgba(34,197,94,0.3)";
        testFeedback.style.color = "#22c55e";
        testFeedback.textContent = `🎉 Success! Connected to folder "${result.folderName}". Full Editor upload permission confirmed for ${result.saEmail}!`;
      } else if (result.readOk && !result.writeOk) {
        testFeedback.style.background = "rgba(245,165,36,0.12)";
        testFeedback.style.border = "1px solid rgba(245,165,36,0.3)";
        testFeedback.style.color = "#f5a524";
        testFeedback.textContent = `⚠️ Folder "${result.folderName}" found, but write permission is missing. Share folder with ${result.saEmail} as "Editor"!`;
      } else {
        testFeedback.style.background = "rgba(244,80,94,0.12)";
        testFeedback.style.border = "1px solid rgba(244,80,94,0.3)";
        testFeedback.style.color = "#f4505e";
        testFeedback.textContent = `❌ Drive check: ${result.error || "Cannot access folder"}.`;
      }
    } catch (e: any) {
      testFeedback.style.background = "rgba(244,80,94,0.12)";
      testFeedback.style.border = "1px solid rgba(244,80,94,0.3)";
      testFeedback.style.color = "#f4505e";
      testFeedback.textContent = `❌ Test error: ${e.message || e}`;
    } finally {
      testBtn.removeAttribute("disabled");
    }
  });

  const activeBox = h(
    "div",
    {
      style: "background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;",
    },
    h("div", { style: "font-weight:600;color:#22c55e;margin-bottom:2px;", text: "✨ Real-Time Partner Sync Active" }),
    h("div", { text: "Files dropped on Mochi automatically upload to Google Drive and broadcast to your partner's PC with an instant download notification button." })
  );

  const guideBox = h(
    "div",
    {
      style: "background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.55;display:flex;flex-direction:column;gap:6px;",
    },
    h("div", { style: "font-weight:600;color:var(--ink);margin-bottom:2px;", text: "📋 2-Minute Google Account Setup (Never Blocked):" }),
    h("div", { text: "1. Open Google Cloud Console with your account: console.cloud.google.com" }),
    h("div", { text: "2. In left menu: APIs & Services → OAuth consent screen → Under 'Test users', click '+ ADD USERS' and add your email (takilaislive@gmail.com). Click Save! (This tells Google to never block your app)." }),
    h("div", { text: "3. In left menu: APIs & Services → Credentials → '+ Create Credentials' → 'OAuth client ID' → Application type: 'Desktop app' → Click Create → Click 'DOWNLOAD JSON'." }),
    h("div", { text: "4. Click '📂 Load client_secret.json' above, pick that file, and click '🔗 Sign In with Google'!" })
  );

  body.append(
    activeBox,
    h("div", { class: "row" }, h("label", { text: "Pair Channel" }), channelInput, channelSave, channelStatus),
    h("div", { class: "row" }, h("label", { text: "Shared Drive Folder" }), folderInput, folderSave, folderStatus),
    h("div", { class: "row", style: "align-items:center;" },
      h("label", { text: "Google Account" }),
      oauthStatusDot,
      oauthStatusText,
      disconnectOAuthBtn
    ),
    h("div", { class: "row", style: "align-items:center;gap:8px;" },
      selectOAuthJsonBtn,
      clientIdInput,
      clientSecretInput,
      connectOAuthBtn
    ),
    h("div", { style: "display:flex;align-items:center;gap:8px;margin-top:2px;" },
      testBtn,
      openFolderBtn
    ),
    testFeedback,
    guideBox
  );

  return section;
}


// ── Application Paths (Launcher) ─────────────────────────────────────────────

function appLauncherSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(true), h("span", { text: "Application Paths (App Launcher)" })),
    body
  );

  body.append(
    h("div", {
      class: "hint",
      text: "Configure paths for applications on your PC. When you tell Mochi 'Open Discord' or 'Launch OBS', it will execute the application instantly.",
    })
  );

  const apps = settings.appPaths || {};
  for (const [appName, appPath] of Object.entries(apps)) {
    const input = h("input", {
      type: "text",
      value: appPath,
      style: "flex:1 1 auto;min-width:0",
    }) as HTMLInputElement;

    input.addEventListener("change", () => {
      if (!settings.appPaths) settings.appPaths = {};
      settings.appPaths[appName] = input.value.trim();
      void save();
    });

    const removeBtn = h("button", {
      class: "danger",
      title: `Remove ${appName}`,
      text: "✕",
      style: "padding:6px 10px;font-size:11px;flex-shrink:0;border-radius:8px;line-height:1;cursor:pointer;",
    });

    removeBtn.addEventListener("click", () => {
      if (settings.appPaths) {
        delete settings.appPaths[appName];
        void save();
        section.replaceWith(appLauncherSection());
      }
    });

    body.append(
      h("div", { class: "row", style: "flex-wrap:nowrap;gap:8px" },
        h("label", { style: "min-width:90px;text-transform:capitalize", text: appName }),
        input,
        removeBtn
      )
    );
  }

  // Add custom app row
  const newName = h("input", { placeholder: "App name (e.g. DaVinci)", style: "width:110px" }) as HTMLInputElement;
  const newPath = h("input", { placeholder: "Executable path...", style: "flex:1 1 auto" }) as HTMLInputElement;
  const addBtn = h("button", { class: "primary", text: "Add App" });

  addBtn.addEventListener("click", () => {
    const name = newName.value.trim().toLowerCase();
    const pathVal = newPath.value.trim();
    if (name && pathVal) {
      if (!settings.appPaths) settings.appPaths = {};
      settings.appPaths[name] = pathVal;
      newName.value = "";
      newPath.value = "";
      void save();
      // Redraw section
      section.replaceWith(appLauncherSection());
    }
  });

  body.append(
    h("div", { class: "group-title", text: "Add Custom App" }),
    h("div", { class: "row" }, newName, newPath, addBtn)
  );

  return section;
}

// ── General Preferences Section ──────────────────────────────────────────────

function generalSection(): HTMLElement {
  const startupToggle = toggle(!!settings.autostart, (on) => {
    settings.autostart = on;
    void save();
  });

  const soundToggle = toggle(settings.soundEnabled, (on) => {
    settings.soundEnabled = on;
    void save();
  });

  const volSlider = h("input", {
    type: "range",
    min: "0",
    max: "0.2",
    step: "0.01",
    value: String(settings.soundVolume),
    style: "flex:1 1 auto",
  }) as HTMLInputElement;
  volSlider.addEventListener("input", () => {
    settings.soundVolume = parseFloat(volSlider.value);
    void save();
  });

  const autoCloseVal = Math.max(2, Math.min(30, settings.autoCloseInterval || 10));
  const autoCloseLabel = h("span", {
    style: "min-width:36px;font-weight:600;font-size:12px;color:var(--ink);",
    text: `${autoCloseVal}s`,
  });

  const autoCloseSlider = h("input", {
    type: "range",
    min: "2",
    max: "30",
    step: "1",
    value: String(autoCloseVal),
    style: "flex:1 1 auto;",
  }) as HTMLInputElement;

  function setAutoCloseSeconds(sec: number) {
    const clamped = Math.max(2, Math.min(30, sec));
    settings.autoCloseInterval = clamped;
    autoCloseSlider.value = String(clamped);
    autoCloseLabel.textContent = `${clamped}s`;
    void save();
  }

  autoCloseSlider.addEventListener("input", () => {
    setAutoCloseSeconds(parseInt(autoCloseSlider.value, 10));
  });

  const preset2s = h("button", { class: "secondary", style: "padding:3px 8px;font-size:11px;", text: "2s", onclick: () => setAutoCloseSeconds(2) });
  const preset5s = h("button", { class: "secondary", style: "padding:3px 8px;font-size:11px;", text: "5s", onclick: () => setAutoCloseSeconds(5) });
  const preset10s = h("button", { class: "secondary", style: "padding:3px 8px;font-size:11px;", text: "10s", onclick: () => setAutoCloseSeconds(10) });
  const preset15s = h("button", { class: "secondary", style: "padding:3px 8px;font-size:11px;", text: "15s", onclick: () => setAutoCloseSeconds(15) });
  const preset30s = h("button", { class: "secondary", style: "padding:3px 8px;font-size:11px;", text: "30s", onclick: () => setAutoCloseSeconds(30) });

  return h(
    "section",
    {},
    h("h2", {}, statusDot(true), h("span", { text: "General & Startup" })),
    h(
      "div",
      {
        class: "row",
        style:
          "display:flex;align-items:center;justify-content:space-between;padding:4px 0 8px;border-bottom:1px solid rgba(255,255,255,0.06);",
      },
      h(
        "div",
        { style: "display:flex;flex-direction:column;gap:3px;" },
        h("label", { style: "font-weight:600;color:var(--ink);cursor:pointer;", text: "Launch on PC Startup 🚀" }),
        h(
          "span",
          { class: "hint", style: "margin:0;font-size:11.5px;color:rgba(255,255,255,0.5);", text: "Mochi turns on instantly when your computer boots up" }
        )
      ),
      startupToggle
    ),
    h("div", { class: "row" }, h("label", { text: "Sound Effects" }), soundToggle),
    h("div", { class: "row" }, h("label", { text: "Volume" }), volSlider),
    h("div", { class: "row", style: "align-items:center;" },
      h("label", { text: "Auto-close Timer" }),
      autoCloseSlider,
      autoCloseLabel
    ),
    h("div", { class: "row", style: "margin-left:144px;gap:6px;" },
      preset2s,
      preset5s,
      preset10s,
      preset15s,
      preset30s
    ),

    h("div", { class: "row", style: "margin-top:8px" },
      h("button", {
        class: "danger",
        style: "background:#f4505e;color:#fff;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:500;font-size:12px",
        text: "Quit Coucou Companion",
        onclick: () => Bridge.quit(),
      })
    ),
    h("div", { class: "version", text: `Coucou Creator v${version}` })
  );
}

// ── Updates & GitHub Sync Section ───────────────────────────────────────────

function updateSection(): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const statusDotEl = statusDot(true);
  const section = h(
    "section",
    {},
    h("h2", {}, statusDotEl, h("span", { text: "Updates & GitHub Sync" })),
    body
  );

  const versionLabel = h("span", {
    style: "font-weight:600;font-size:12.5px;color:var(--ink);",
    text: `Mochi v${version}`,
  });

  const checkBtn = h("button", {
    class: "secondary",
    style: "font-size:12px;padding:6px 14px;cursor:pointer;",
    text: "🔄 Check for Updates",
  });

  const statusText = h("div", {
    class: "hint",
    style: "font-size:12px;color:var(--dim);line-height:1.5;",
    text: "Mochi connects directly to your GitHub repository (takayduo/Mochi-Eye) to check for updates and bug fixes.",
  });

  // Card displayed when an update is available
  const updateCard = h("div", {
    style:
      "display:none;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:14px;flex-direction:column;gap:10px;margin-top:4px;",
  });

  const updateTitle = h("div", {
    style: "font-weight:600;font-size:13px;color:#22c55e;display:flex;align-items:center;gap:6px;",
    text: "✨ New Update Available!",
  });

  const commitDetails = h("div", {
    style: "font-size:12px;color:var(--ink);display:flex;flex-direction:column;gap:4px;",
  });

  const updateBtn = h("button", {
    class: "primary",
    style:
      "background:#22c55e;color:#000;font-weight:600;font-size:12.5px;padding:8px 18px;align-self:flex-start;border-radius:8px;cursor:pointer;border:none;",
    text: "🚀 Update Mochi & Restart",
  });

  const progressText = h("div", {
    style: "display:none;font-size:12px;color:#f5a524;font-weight:500;",
    text: "",
  });

  updateCard.append(updateTitle, commitDetails, updateBtn, progressText);

  // Listen for live update progress events from Electron main process
  Bridge.on("update-progress", (msg: string) => {
    progressText.style.display = "block";
    progressText.textContent = `⏳ ${msg}`;
  });

  async function check() {
    checkBtn.setAttribute("disabled", "true");
    checkBtn.textContent = "Checking GitHub...";
    statusText.textContent = "Connecting to GitHub...";
    statusText.style.color = "var(--dim)";

    try {
      const res = await Bridge.checkForUpdates();
      if (!res || !res.success) {
        statusText.textContent = `⚠️ Could not check for updates: ${res?.error || "Network error"}`;
        statusText.style.color = "#f4505e";
        statusDotEl.style.background = "#f4505e";
        return;
      }

      const localShort = res.local?.commitShort || "current";
      versionLabel.textContent = `Mochi v${res.local?.version || version} (${localShort})`;

      if (res.updateAvailable && res.remote) {
        statusDotEl.style.background = "#22c55e";
        statusText.textContent = "✨ An update is ready to install!";
        statusText.style.color = "#22c55e";

        clear(commitDetails);
        const dateStr = res.remote.date ? new Date(res.remote.date).toLocaleString() : "";
        commitDetails.append(
          h("div", {
            style: "font-weight:500;color:var(--ink);",
            text: `Latest commit: ${res.remote.message || "New updates available"}`,
          }),
          h("div", {
            style: "color:var(--dim);font-size:11.5px;",
            text: `Commit ${res.remote.commitShort} • Released: ${dateStr}`,
          }),
          h("div", {
            style: "color:rgba(255,255,255,0.6);font-size:11.5px;margin-top:2px;",
            text: "Your settings, API keys, tasks, and chat history are safely preserved during updates.",
          })
        );

        updateCard.style.display = "flex";
      } else {
        statusDotEl.style.background = "#22c55e";
        statusText.textContent = `✅ Mochi is completely up to date with GitHub (Commit: ${localShort}).`;
        statusText.style.color = "#22c55e";
        updateCard.style.display = "none";
      }
    } catch (e: any) {
      statusText.textContent = `⚠️ Error checking for updates: ${e.message || e}`;
      statusText.style.color = "#f4505e";
      statusDotEl.style.background = "#f4505e";
    } finally {
      checkBtn.removeAttribute("disabled");
      checkBtn.textContent = "🔄 Check for Updates";
    }
  }

  checkBtn.addEventListener("click", () => void check());

  updateBtn.addEventListener("click", async () => {
    updateBtn.setAttribute("disabled", "true");
    checkBtn.setAttribute("disabled", "true");
    updateBtn.textContent = "Updating...";
    progressText.style.display = "block";
    progressText.textContent = "⏳ Starting update process...";

    try {
      const res = await Bridge.performUpdate();
      if (res && !res.success) {
        progressText.textContent = `❌ Update failed: ${res.error || "Unknown error"}`;
        progressText.style.color = "#f4505e";
        updateBtn.removeAttribute("disabled");
        checkBtn.removeAttribute("disabled");
        updateBtn.textContent = "🚀 Retry Update";
      }
    } catch (err: any) {
      progressText.textContent = `❌ Update failed: ${err.message || err}`;
      progressText.style.color = "#f4505e";
      updateBtn.removeAttribute("disabled");
      checkBtn.removeAttribute("disabled");
      updateBtn.textContent = "🚀 Retry Update";
    }
  });

  // Auto-check 400ms after opening settings
  setTimeout(() => {
    void check();
  }, 400);

  body.append(
    h(
      "div",
      {
        class: "hint",
        text: "Whenever Badsha pushes new features or fixes to GitHub, you can update Mochi in 1 click. All your personal data, API keys, tasks, and couple sync stay 100% untouched.",
      }
    ),
    h(
      "div",
      {
        class: "row",
        style: "display:flex;align-items:center;justify-content:space-between;padding:4px 0;",
      },
      h("div", { style: "display:flex;flex-direction:column;gap:3px;" },
        h("label", { style: "font-weight:600;color:var(--ink);", text: "Installed Version" }),
        versionLabel
      ),
      checkBtn
    ),
    statusText,
    updateCard
  );

  return section;
}

async function init() {
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...DEFAULT_SETTINGS, ...boot.settings };
    version = boot.version || "1.0.0-creator";
  }

  clear(root);
  root.append(
    aiSection(),
    coupleSection(),
    supabaseSection(),
    cloudSection(),
    appLauncherSection(),
    generalSection(),
    updateSection()
  );
}

void init();
