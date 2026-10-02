// Mochi Eye — Host Screen Sharing Engine (WebRTC + DXGI Capture)
import { Bridge } from "../core/bridge";

let hostPeer: RTCPeerConnection | null = null;
let hostStream: MediaStream | null = null;
let inputChannel: RTCDataChannel | null = null;
let hostGatheredCandidates: any[] = [];
let pendingViewerCandidates: any[] = [];

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turn:standard.relay.metered.ca:80",
      "turn:standard.relay.metered.ca:443",
      "turn:standard.relay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export interface HostStartResult {
  success: boolean;
  offer?: { type: string; sdp: string; candidates?: any[] };
  resolution?: { width: number; height: number };
}

export async function startHostScreenSharing(): Promise<HostStartResult> {
  stopHostScreenSharing();
  hostGatheredCandidates = [];
  pendingViewerCandidates = [];

  try {
    const source = await Bridge.getPrimaryScreenSource();
    if (!source) {
      console.error("[HostStream] No primary screen source available");
      return { success: false };
    }

    console.log("[HostStream] Primary display source found:", source.id, `${source.width}x${source.height}`);

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
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    hostPeer.oniceconnectionstatechange = () => {
      console.log("[HostStream] ICE connection state:", hostPeer?.iceConnectionState);
    };

    hostPeer.onconnectionstatechange = () => {
      console.log("[HostStream] Peer connection state:", hostPeer?.connectionState);
    };

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
        const c = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
        hostGatheredCandidates.push(c);
        void Bridge.sendRemoteSignal({ type: "candidate", candidate: c });
      }
    };

    // Create & dispatch SDP Offer to partner
    const offer = await hostPeer.createOffer();
    await hostPeer.setLocalDescription(offer);

    const resolution = { width: source.width || 1920, height: source.height || 1080 };
    const offerPayload = {
      type: "offer",
      sdp: offer.sdp || "",
      candidates: hostGatheredCandidates,
    };

    // Also broadcast the offer signal as fallback
    await Bridge.sendRemoteSignal({
      type: "offer",
      sdp: offer.sdp,
      resolution,
    });

    console.log("[HostStream] Started WebRTC screen sharing successfully");
    return { success: true, offer: offerPayload, resolution };
  } catch (err) {
    console.error("[HostStream] Screen sharing startup failed:", err);
    stopHostScreenSharing();
    return { success: false };
  }
}

export async function handleHostSignal(signal: any): Promise<void> {
  if (!hostPeer || !signal) return;

  try {
    if (signal.type === "answer") {
      console.log("[HostStream] Received SDP Answer from partner viewer");
      await hostPeer.setRemoteDescription(new RTCSessionDescription(signal));
      console.log("[HostStream] WebRTC connection established with partner viewer!");

      // Flush queued viewer ICE candidates
      while (pendingViewerCandidates.length > 0) {
        const cand = pendingViewerCandidates.shift();
        try {
          await hostPeer.addIceCandidate(new RTCIceCandidate(cand));
        } catch (iceErr) {
          console.warn("[HostStream] Failed adding queued candidate:", iceErr);
        }
      }
    } else if (signal.type === "candidate") {
      if (hostPeer.remoteDescription && hostPeer.remoteDescription.type) {
        await hostPeer.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        pendingViewerCandidates.push(signal.candidate);
      }
    } else if (signal.type === "ready") {
      console.log("[HostStream] Viewer reported ready! Re-sending SDP Offer & gathered candidates...");
      if (hostPeer.localDescription) {
        await Bridge.sendRemoteSignal({
          type: "offer",
          sdp: hostPeer.localDescription.sdp,
          candidates: hostGatheredCandidates,
        });
      }
      for (const c of hostGatheredCandidates) {
        await Bridge.sendRemoteSignal({ type: "candidate", candidate: c });
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
  hostGatheredCandidates = [];
  pendingViewerCandidates = [];
  console.log("[HostStream] Stopped screen sharing and closed peer connection");
}
