// Mochi Eye — Host Screen Sharing Engine (WebRTC + DXGI Capture)
import { Bridge } from "../core/bridge";

let hostPeer: RTCPeerConnection | null = null;
let hostStream: MediaStream | null = null;
let inputChannel: RTCDataChannel | null = null;

export async function startHostScreenSharing(): Promise<boolean> {
  stopHostScreenSharing();

  try {
    const source = await Bridge.getPrimaryScreenSource();
    if (!source) {
      console.error("[HostStream] No primary screen source available");
      return false;
    }

    // Capture screen via standard Chromium DXGI desktop capture
    hostStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: source.id,
          maxWidth: Math.min(2560, source.width || 1920),
          maxHeight: Math.min(1440, source.height || 1080),
          maxFrameRate: 60,
        },
      },
    });

    hostPeer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });

    // Add local screen video tracks
    for (const track of hostStream.getTracks()) {
      hostPeer.addTrack(track, hostStream);
    }

    // Low-latency DataChannel for direct mouse & keyboard events
    function wireChannel(ch: RTCDataChannel) {
      ch.onopen = () => console.log("[HostStream] DataChannel is OPEN for input:", ch.label);
      ch.onmessage = (e) => {
        if (typeof e.data === "string") {
          void Bridge.injectInput(e.data);
        }
      };
      ch.onerror = (err) => console.warn("[HostStream] DataChannel error:", err);
    }

    inputChannel = hostPeer.createDataChannel("input", { ordered: true });
    wireChannel(inputChannel);

    hostPeer.ondatachannel = (e) => {
      console.log("[HostStream] Received incoming DataChannel from partner:", e.channel.label);
      wireChannel(e.channel);
    };

    hostPeer.onicecandidate = (e) => {
      if (e.candidate) {
        void Bridge.sendRemoteSignal({ type: "candidate", candidate: e.candidate });
      }
    };

    // Create & dispatch SDP Offer to partner
    const offer = await hostPeer.createOffer();
    await hostPeer.setLocalDescription(offer);

    await Bridge.sendRemoteSignal({
      type: "offer",
      sdp: offer.sdp,
      resolution: { width: source.width || 1920, height: source.height || 1080 },
    });

    console.log("[HostStream] Started WebRTC screen sharing successfully");
    return true;
  } catch (err) {
    console.error("[HostStream] Screen sharing startup failed:", err);
    stopHostScreenSharing();
    return false;
  }
}

export async function handleHostSignal(signal: any): Promise<void> {
  if (!hostPeer || !signal) return;

  try {
    if (signal.type === "answer") {
      await hostPeer.setRemoteDescription(new RTCSessionDescription(signal));
      console.log("[HostStream] WebRTC connection established with partner viewer!");
    } else if (signal.type === "candidate") {
      await hostPeer.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } else if (signal.type === "ready") {
      if (hostPeer.localDescription) {
        await Bridge.sendRemoteSignal({
          type: "offer",
          sdp: hostPeer.localDescription.sdp,
        });
      }
    }
  } catch (err) {
    console.warn("[HostStream] Signal handling error:", err);
  }
}

export function stopHostScreenSharing(): void {
  if (hostStream) {
    for (const track of hostStream.getTracks()) {
      track.stop();
    }
    hostStream = null;
  }
  if (inputChannel) {
    try { inputChannel.close(); } catch (e) {}
    inputChannel = null;
  }
  if (hostPeer) {
    try { hostPeer.close(); } catch (e) {}
    hostPeer = null;
  }
  console.log("[HostStream] Stopped screen sharing and closed peer connection");
}
