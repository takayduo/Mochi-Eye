# 🍡 Mochi Eye — AI Desktop Companion with Remote PC Co-Pilot

> **A lively, interactive desktop companion overlay that lives at the top of your screen.**
> Featuring authentic 2D squircle physics, eye-following animations, live peer-to-peer partner chat, daily creator schedule, AI voice assistance, file eating, and **safe, high-speed Remote Desktop Co-Pilot control**.

---

## ✨ Features

- 🖥️ **Remote Desktop Co-Pilot (Mochi Eye)**:
  - **Mutual Permission**: Either partner can click *"Request Remote Access"*. The other receives an interactive prompt to Accept or Decline.
  - **Full Control**: Smooth 60 FPS remote screen view, mouse movement, dragging, clicking, and keyboard shortcuts.
  - **GPU-Safe (Zero Virtual Drivers)**: Uses Microsoft DirectX Desktop Duplication (DXGI) without any intrusive kernel or virtual display drivers (unlike Parsec, which damages GPUs).
  - **Fullscreen Viewer Window**: Mochi's top notch stays small and pretty on your main screen, while the remote partner's screen opens in a dedicated window that can be toggled Fullscreen with 1 click (<kbd>F11</kbd>).
  - **1-Click Disconnect**: Both parties have immediate control to end the remote session at any second.
- 🍡 **Authentic Canvas 2D Physics**: Exact squircle superellipse math, cursor-following pupils, eye blinks, breathing springs, particle systems (hearts, stars, sweat drops), and emotional states (`idle`, `thinking`, `happy`, `love`, `dizzy`, `annoyed`, `sleeping`, `error`).
- 💬 **Live Partner Chat (Badsha 👤 ⟷ Ayzil 💖)**:
  - Sub-50ms real-time peer-to-peer messaging via Supabase Realtime broadcast.
  - Sound chimes (`blip.wav`, `greet.wav`) on incoming messages.
  - Unread count badge on the chat tab when collapsed.
  - Desktop native Windows notifications.
  - Live partner presence indicator (🟢 Online).
- 📅 **Daily Content Calendar & Schedule**:
  - Assigned task management between creator couples ("Me" vs "Her").
  - Instant task creation, completion chimes (`finish.wav`), and cross-PC live synchronization.
- 🎙️ **AI Voice & Assistant (Multi-LLM)**:
  - Connect your favorite free or pro AI: **Google Gemini** (`gemini-2.5-flash`), **Groq** (`openai/gpt-oss-120b`), or **OpenRouter**.
  - Natural speech input and Windows SAPI native voice readouts.
  - Ask schedule queries (*"What is our schedule for today?"*) and dictate partner messages (*"Send message to Ayzil: I'll be ready in 10 minutes"*).
- 🚀 **App Launcher & Closer**:
  - Say or click to launch: Discord, WhatsApp, OBS, Premiere Pro, Roblox, Spotify, and more.
  - Say *"Close OBS"* or *"Close WhatsApp"* to terminate background processes cleanly.
  - Configure or remove shortcuts directly from the Settings GUI.
- 📦 **File Eating Suction Physics**:
  - Drag and drop any video, thumbnail, or script onto Mochi.
  - Superellipse mouth opening suction animation with signature `gulp.wav` eating sound effect.
  - Optional Google Drive cross-PC relay to share files with your partner.
- 🪟 **Frameless Top Bar Overlay**:
  - Always-on-top, transparent, click-through background when collapsed.
  - System tray icon with one-click settings, show/hide, and startup mode.

---

## 📋 Required System & Software Prerequisites

Before installing Mochi Eye, make sure you have:

1. **Operating System**:
   - **Windows 10 / 11** (Recommended for native sound, SAPI speech, and auto-start integration).
   - Also runs on macOS and Linux with standard Electron support.
2. **Node.js**:
   - Version **18.0.0** or higher (LTS version 20+ recommended).
   - Download from [nodejs.org](https://nodejs.org/) (check with `node -v`).

---

## 🚀 Easy Installation Guide (Works on Any PC — Even Brand New!)

You do **not** need Git or programming experience to run Mochi Eye. Choose whichever method is easiest for you:

---

### 🌟 Method 1: 1-Line Automatic Installer (Fastest & Recommended)
Works on any fresh Windows 10/11 PC or Windows Sandbox (even with **no Git** and **no Node.js** installed):

1. Press `Win + X` and click **Terminal** or **Windows PowerShell**.
2. Paste this single command and press `Enter`:
   ```powershell
   irm https://raw.githubusercontent.com/takayduo/Mochi-Eye/main/install.ps1 | iex
   ```
3. That's it! The script will:
   - Auto-install Node.js if missing.
   - Download the latest Mochi files (no Git needed).
   - Install packages and build the desktop app.
   - Create a **Mochi** shortcut on your Desktop and launch it immediately.

---

### 📦 Method 2: Download ZIP (Zero Terminal Typing)
If you prefer not using commands at all:

1. Click the green **`<> Code`** button at the top of this GitHub page and select **`Download ZIP`**.
2. Right-click the downloaded `Mochi-main.zip` $\rightarrow$ click **Extract All…** $\rightarrow$ Extract.
3. Open the extracted folder and double-click **`setup.bat`**.
4. The batch installer will auto-configure everything and create a desktop shortcut for you!

---

### 💻 Method 3: For Developers & Terminal Users (Git & NPM)
If you already have Git and Node.js LTS installed:

```bash
git clone https://github.com/takayduo/Mochi.git
cd Mochi
npm install
npm run build
npm start
```

---

## 🖥️ How to Run After Installation
Once installed, you can launch Mochi anytime:
- **Desktop Shortcut**: Double-click the **Mochi** icon on your Desktop.
- **Direct Launcher**: Double-click **`Launch Mochi.bat`** (instantly starts Mochi in background and closes the prompt).
- **Terminal Launch**: Run `npm start` or `npm run app`.

---

## ⚙️ Quick Configuration Guide

You do **NOT** need to edit any code files to configure Mochi. Everything is set up via the built-in Settings window:

1. Click the **⚙️ Gear icon** on the Mochi top bar, or right-click the **Mochi icon** in your Windows System Tray $\rightarrow$ select **Settings…**.
2. **AI Models & API Keys**:
   - Choose **Google Gemini** (get a free key at [Google AI Studio](https://aistudio.google.com/)) or **Groq** (free key at [groq.com](https://groq.com/)).
   - Paste the key and click **Save**.
3. **Creator Couple Profile**:
   - Select your profile for this PC: **Me 👤** or **Her 💖**.
   - Set your name and your partner's name.
4. **Live Partner Sync (Supabase)**:
   - Enter your Supabase Project URL and Public Anon Key to enable cross-PC live chat, task syncing, and online presence.
5. **Application Paths (App Launcher)**:
   - Enter your favorite app executable or shortcut paths (e.g. `C:\Users\<user>\Desktop\Discord.lnk`).
   - Use the **✕** button to delete shortcuts you don't need, or add new ones with **Add Custom App**.
6. **Startup Mode**:
   - Toggle **Startup Mode** to **ON** to have Mochi automatically start when your PC turns on.

---

## 📁 Repository Structure & Required Files

```
Mochi/
├── electron/                  # Electron Main Process & Native APIs
│   ├── main.js                # Core Electron lifecycle, window management & IPC
│   ├── preload.js             # Secure ContextBridge between Electron & Renderer
│   ├── supabase.js            # Live Realtime channels, presence & message broadcast
│   ├── gdrive.js              # Google Drive OAuth & cross-PC file uploads
│   └── sapi.js                # Windows SAPI native text-to-speech engine
│
├── src/                       # Frontend Application (TypeScript + Vite)
│   ├── core/                  # Core audio, layout, state, voice & IPC bridge
│   │   ├── bridge.ts          # Strongly-typed bridge calling Electron IPC
│   │   ├── state.ts           # Settings state & default configurations
│   │   ├── sound.ts           # Audio manager for sound effects
│   │   ├── voice.ts           # Speech recognition & mic handling
│   │   └── anim.ts            # Spring physics & easing helpers
│   ├── island/                # Dynamic Island UI Container
│   │   ├── island.ts          # Expansion states, pills, animations & tabs
│   │   └── fsm.ts             # Finite State Machine for island behaviors
│   ├── mochi/                 # Mochi Canvas Avatar Engine
│   │   ├── engine.ts          # Squircle math, pupil physics, emotes & particles
│   │   └── greeting.ts        # Slide-down greeting & wave animations
│   ├── views/                 # Island Tabs & Modules
│   │   ├── coupleChat.ts      # Live Partner Chat (Badsha ⟷ Ayzil)
│   │   ├── chat.ts            # AI Assistant chat view
│   │   ├── schedule.ts        # Content Calendar & task manager
│   │   ├── integrations.ts    # App launcher pills
│   │   └── views.ts           # Tab switcher & header layout
│   ├── settings/              # Settings Window GUI
│   │   ├── main.ts            # Settings inputs, tabs & save logic
│   │   └── settings.css       # Clean dark-mode stylesheet
│   └── upload/                # File suction & eating canvas animations
│
├── public/                    # Static Assets
│   ├── icons/                 # App and system tray icons (.ico, .png)
│   └── sounds/                # 28 handcrafted .wav audio sound effects
│
├── install.ps1                # 1-line PowerShell installer (no Git/Node needed)
├── setup.bat                  # 1-click batch installer & dependency setup
├── Launch Mochi.bat           # 1-click Windows background launcher
├── package.json               # Node.js dependencies & scripts
├── tsconfig.json              # TypeScript compilation settings
├── vite.config.ts             # Vite multi-page build configuration
└── README.md                  # Installation & documentation
```

---

## 🛠️ Verification & Build Commands

- **Build production bundle**:
  ```bash
  npm run build
  ```
- **Run in development mode**:
  ```bash
  npm run dev
  ```
- **Start Electron application**:
  ```bash
  npm run app
  ```

---

## 🔒 Privacy & Security

- **Zero Hardcoded Secrets**: No API keys, passwords, or personal credentials are hardcoded into the source code.
- **Local Storage**: All user settings, API keys, and chat histories are safely stored in your local operating system user profile (`%APPDATA%\coucou-creator\CoucouCreator`).
- **Encrypted Transmission**: Realtime chat and presence utilize encrypted TLS/WSS connections.

---

## 📄 License

MIT License — Feel free to customize and enjoy with your partner!
