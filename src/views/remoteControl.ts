// Remote Control view — Mochi Eye Co-Pilot PC-to-PC Access
import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { startHostScreenSharing, stopHostScreenSharing } from "../remote/hostStream";
import type { ViewActions, ViewHost } from "./views";

export function buildRemoteControl(actions: ViewActions): ViewHost {
  const presenceBadge = h("span", {
    class: "sched-presence-badge",
    style: "font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,0.15);color:#22c55e;display:inline-flex;align-items:center;gap:4px;",
    text: "🟢 Online",
  });

  const headerTitle = h("div", {
    class: "sched-title",
    style: "display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;",
    text: "Mochi Eye — Co-Pilot 🖥️",
  });

  const topRow = h(
    "div",
    {
      class: "sched-header-row",
      style: "display:flex;align-items:center;justify-content:space-between;padding:2px 4px 6px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:8px;",
    },
    headerTitle,
    presenceBadge
  );

  const contentArea = h("div", {
    style: "flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:8px 6px;text-align:center;",
  });

  const el = h(
    "div",
    { class: "view remote-control-view" },
    h(
      "div",
      { class: "card wash remote-card" },
      h("div", { style: "height:100%;display:flex;flex-direction:column;" }, topRow, contentArea)
    )
  );
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(59, 130, 246, 0.25)");

  function getPartnerName() {
    const isMe = (State.settings.userRole || "me") === "me";
    const rawPartner = isMe ? (State.settings.partnerName || "Ayzil") : (State.settings.userName || "Badsha");
    return (rawPartner.charAt(0).toUpperCase() + rawPartner.slice(1)) || "Partner";
  }

  let availableScreens: Array<{ id: string; displayId?: number; name: string; label: string; bounds: { x: number; y: number; width: number; height: number }; width: number; height: number; isPrimary: boolean }> = [];
  let selectedScreenId = "";
  let isLoadingScreens = false;

  function renderState() {
    clear(contentArea);
    const partnerName = getPartnerName();
    const status = State.remoteAccessStatus;

    if (status === "incoming_request") {
      // Fetch available screens if not already loaded
      if (availableScreens.length === 0 && !isLoadingScreens) {
        isLoadingScreens = true;
        void Bridge.getAvailableScreens().then((screens) => {
          isLoadingScreens = false;
          if (screens && screens.length > 0) {
            availableScreens = screens;
            const primary = screens.find((s) => s.isPrimary) || screens[0];
            selectedScreenId = primary ? primary.id : screens[0].id;
            renderState();
          }
        });
      }

      // Incoming request from partner!
      const requester = State.remoteRequesterName || partnerName;
      const title = h("div", { style: "font-size:13.5px;font-weight:700;color:#60a5fa;", text: "🖥️ Remote Access Request" });
      const desc = h("div", {
        style: "font-size:11.5px;color:var(--dim);line-height:1.45;max-width:240px;",
        text: `${requester} wants to remotely control your PC. You can watch and end the session anytime.`,
      });

      let monitorSection: HTMLElement | null = null;
      if (availableScreens.length > 1) {
        const monLabel = h("div", {
          style: "font-size:11px;font-weight:600;color:var(--ink);margin-top:4px;display:flex;align-items:center;gap:4px;",
          text: "🖥️ Choose Monitor to Share:",
        });

        const monSelect = h("select", {
          style: "width:100%;max-width:240px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:#f4f4f5;padding:5px 8px;font-size:11px;outline:none;cursor:pointer;",
        }) as HTMLSelectElement;

        for (const scr of availableScreens) {
          const opt = h("option", {
            value: scr.id,
            text: scr.label,
            style: "background:#18181b;color:#f4f4f5;",
          }) as HTMLOptionElement;
          if (scr.id === selectedScreenId) opt.selected = true;
          monSelect.append(opt);
        }

        monSelect.addEventListener("change", (e: any) => {
          selectedScreenId = e.target.value;
        });

        monitorSection = h("div", { style: "display:flex;flex-direction:column;gap:3px;margin:2px 0;" }, monLabel, monSelect);
      }

      const btnAccept = h(
        "button",
        {
          class: "btn primary",
          style: "background:linear-gradient(135deg, #22c55e, #16a34a);color:#fff;border:none;padding:6px 14px;border-radius:14px;font-weight:600;font-size:12px;cursor:pointer;",
        },
        "Accept & Share Screen 🟢"
      ) as HTMLButtonElement;

      btnAccept.addEventListener("click", async () => {
        btnAccept.disabled = true;
        btnAccept.textContent = "Connecting... ⏳";
        Sound.play("approve");

        const chosenScreen = availableScreens.find((s) => s.id === selectedScreenId) || availableScreens[0];
        const res = await startHostScreenSharing(chosenScreen);

        if (res && res.success && res.offer) {
          State.remoteAccessStatus = "active_host";
          renderState();
          State.notify();
          await Bridge.respondRemoteAccess(true, {
            offer: res.offer,
            resolution: res.resolution,
            displayBounds: chosenScreen?.bounds,
          });
        } else {
          State.remoteAccessStatus = "idle";
          renderState();
          State.notify();
          Sound.play("blip");
          State.noteMessage = "⚠️ Could not capture screen. Please retry.";
          await Bridge.respondRemoteAccess(false);
        }
      });

      const btnDecline = h(
        "button",
        {
          class: "btn secondary",
          style: "background:rgba(255,255,255,0.08);color:var(--dim);border:1px solid rgba(255,255,255,0.12);padding:6px 12px;border-radius:14px;font-size:11.5px;cursor:pointer;",
        },
        "Decline ✕"
      );
      btnDecline.addEventListener("click", async () => {
        Sound.play("blip");
        State.remoteAccessStatus = "idle";
        renderState();
        State.notify();
        await Bridge.respondRemoteAccess(false);
      });

      const btnRow = h("div", { style: "display:flex;align-items:center;gap:8px;margin-top:6px;" }, btnAccept, btnDecline);
      if (monitorSection) {
        contentArea.append(title, desc, monitorSection, btnRow);
      } else {
        contentArea.append(title, desc, btnRow);
      }
      return;
    }

    if (status === "requesting") {
      // Waiting for partner to accept
      const spinner = h("div", {
        style: "width:32px;height:32px;border:3px solid rgba(255,255,255,0.12);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;",
      });
      const text = h("div", { style: "font-size:12px;color:var(--ink);font-weight:500;", text: `Request sent to ${partnerName}...` });
      const subtext = h("div", { style: "font-size:10.5px;color:var(--dim);", text: "Waiting for them to click Accept on their screen." });

      const btnCancel = h(
        "button",
        {
          class: "btn secondary",
          style: "background:rgba(255,255,255,0.08);color:var(--dim);border:1px solid rgba(255,255,255,0.12);padding:5px 12px;border-radius:12px;font-size:11px;cursor:pointer;margin-top:4px;",
        },
        "Cancel Request ✕"
      );
      btnCancel.addEventListener("click", async () => {
        State.remoteAccessStatus = "idle";
        renderState();
        State.notify();
        await Bridge.endRemoteAccess();
      });

      contentArea.append(spinner, text, subtext, btnCancel);
      return;
    }

    if (status === "active_viewer") {
      // I am controlling partner's PC
      const icon = h("div", { style: "font-size:26px;", text: "🖥️" });
      const text = h("div", { style: "font-size:13px;font-weight:700;color:#60a5fa;", text: `Controlling ${partnerName}'s PC` });
      const hint = h("div", { style: "font-size:10.5px;color:var(--dim);", text: "Use the separate Fullscreen viewer window to control screen, mouse & keyboard." });

      const btnEnd = h(
        "button",
        {
          class: "btn btn-danger",
          style: "background:rgba(239,68,68,0.25);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:6px 14px;border-radius:14px;font-weight:600;font-size:12px;cursor:pointer;margin-top:6px;",
        },
        "End Remote Access 🛑"
      );
      btnEnd.addEventListener("click", async () => {
        Sound.play("close");
        State.remoteAccessStatus = "idle";
        renderState();
        State.notify();
        await Bridge.endRemoteAccess();
      });

      contentArea.append(icon, text, hint, btnEnd);
      return;
    }

    if (status === "active_host") {
      // Partner is controlling my PC
      const icon = h("div", { style: "font-size:26px;", text: "🎮" });
      const text = h("div", { style: "font-size:13px;font-weight:700;color:#22c55e;", text: `${partnerName} is controlling this PC` });
      const hint = h("div", { style: "font-size:10.5px;color:var(--dim);", text: "Your screen is being shared live. You can disconnect at any moment." });

      const btnEnd = h(
        "button",
        {
          class: "btn btn-danger",
          style: "background:rgba(239,68,68,0.25);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:6px 14px;border-radius:14px;font-weight:600;font-size:12px;cursor:pointer;margin-top:6px;",
        },
        "Disconnect Partner 🛑"
      );
      btnEnd.addEventListener("click", async () => {
        Sound.play("close");
        stopHostScreenSharing();
        State.remoteAccessStatus = "idle";
        renderState();
        State.notify();
        await Bridge.endRemoteAccess();
      });

      contentArea.append(icon, text, hint, btnEnd);
      return;
    }

    // Default IDLE state
    const icon = h("div", { style: "font-size:28px;", text: "🖥️" });
    const title = h("div", { style: "font-size:12.5px;font-weight:600;color:var(--ink);", text: `Remote PC Access to ${partnerName}` });
    const desc = h("div", {
      style: "font-size:11px;color:var(--dim);line-height:1.45;max-width:230px;",
      text: `Request permission to control ${partnerName}'s desktop in full-screen with mouse & keyboard.`,
    });

    const btnRequest = h(
      "button",
      {
        class: "btn primary",
        style: "background:linear-gradient(135deg, #3b82f6, #6366f1);color:#fff;border:none;padding:7px 16px;border-radius:16px;font-weight:600;font-size:12px;cursor:pointer;margin-top:4px;box-shadow:0 4px 12px rgba(59,130,246,0.3);",
      },
      `Request Access to ${partnerName}'s PC`
    );
    btnRequest.addEventListener("click", async () => {
      Sound.play("open");
      State.remoteAccessStatus = "requesting";
      renderState();
      State.notify();
      await Bridge.requestRemoteAccess();
    });

    contentArea.append(icon, title, desc, btnRequest);
  }

  return {
    el,
    sync() {
      const partnerName = getPartnerName();
      headerTitle.textContent = `Co-Pilot — ${partnerName} 🖥️`;

      if (State.partnerOnline) {
        presenceBadge.style.background = "rgba(34,197,94,0.15)";
        presenceBadge.style.color = "#22c55e";
        presenceBadge.textContent = "🟢 Online";
      } else {
        presenceBadge.style.background = "rgba(255,255,255,0.06)";
        presenceBadge.style.color = "var(--dim)";
        presenceBadge.textContent = "⚪ Offline";
      }

      renderState();
    },
    focus() {
      renderState();
    },
  };
}
