// Mochi Eye — Host Screen Sharing Engine (WebRTC + DXGI/WGC Capture)
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
  { urls: "stun:stun.services.mozilla.com" },
];

export interface HostStartResult {
  success: boolean;
  offer?: { type: string; sdp: string; candidates?: any[] };
  resolution?: { width: number; height: number };
}

export async function startHostScreenSharing(targetScreen?: {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  bounds?: { x: number; y: number; width: number; height: number };
}): Promise<HostStartResult> {
  stopHostScreenSharing();
  hostGatheredCandidates = [];
  pendingViewerCandidates = [];

  try {
    let source = targetScreen;
    if (!source || !source.id) {
      source = (await Bridge.getPrimaryScreenSource()) || undefined;
    }
    if (!source || !source.id) {
      console.error("[HostStream] No screen source available for capture");
      return { success: false };
    }

    const screenWidth = source.bounds?.width || source.width || 1920;
    const screenHeight = source.bounds?.height || source.height || 1080;

    console.log(`[HostStream] Starting screen capture on source: ${source.id} (${source.name || "Screen"}) ${screenWidth}x${screenHeight}`);

    // Try capturing with desktop source ID; fallback to minimal constraints if driver rejects
    try {
      hostStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            maxWidth: Math.max(screenWidth, 1920),
            maxHeight: Math.max(screenHeight, 1080),
            minFrameRate: 30,
            maxFrameRate: 60,
          },
        },
      });
    } catch (constraintErr) {
      console.warn("[HostStream] Primary constraints rejected, trying minimal constraints:", constraintErr);
      hostStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
          },
        },
      });
    }

    if (!hostStream || hostStream.getVideoTracks().length === 0) {
      console.error("[HostStream] Failed to obtain video track from screen capture");
      stopHostScreenSharing();
      return { success: false };
    }

    console.log("[HostStream] Screen video track acquired successfully:", hostStream.getVideoTracks()[0].label);

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

    // Add local screen video tracks with low-latency motion hint
    for (const track of hostStream.getTracks()) {
      if (track.kind === "video") {
        (track as any).contentHint = "motion";
      }
      const sender = hostPeer.addTrack(track, hostStream);
      try {
        const params = sender.getParameters();
        if (params && params.encodings && params.encodings.length > 0) {
          params.encodings[0].networkPriority = "high";
          (params.encodings[0] as any).priority = "high";
          params.encodings[0].maxBitrate = 12000000;
          sender.setParameters(params).catch(() => {});
        }
      } catch (e) {}
    }

    // Prioritize hardware-accelerated H.264 video codec if available for sub-frame latency
    try {
      if (typeof RTCRtpSender.getCapabilities === "function") {
        const videoCaps = RTCRtpSender.getCapabilities("video");
        if (videoCaps && videoCaps.codecs) {
          const h264Codecs = videoCaps.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
          const otherCodecs = videoCaps.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
          if (h264Codecs.length > 0) {
            for (const transceiver of hostPeer.getTransceivers()) {
              if (transceiver.sender && transceiver.sender.track?.kind === "video" && (transceiver as any).setCodecPreferences) {
                (transceiver as any).setCodecPreferences([...h264Codecs, ...otherCodecs]);
                console.log("[HostStream] Prioritized H.264 hardware encoding for minimal latency");
              }
            }
          }
        }
      }
    } catch (codecErr) {
      console.warn("[HostStream] Codec preference setup skipped:", codecErr);
    }

    // High-performance unordered DataChannel for real-time mouse & keyboard events (0 retransmits)
    function wireChannel(ch: RTCDataChannel) {
      ch.binaryType = "arraybuffer";
      ch.onopen = () => console.log("[HostStream] High-speed DataChannel is OPEN for input:", ch.label);
      ch.onmessage = (e) => {
        if (typeof e.data === "string") {
          Bridge.injectInputFast(e.data);
        }
      };
      ch.onerror = (err) => console.warn("[HostStream] DataChannel error:", err);
    }

    inputChannel = hostPeer.createDataChannel("input", {
      ordered: false,
      maxRetransmits: 0,
    });
    wireChannel(inputChannel);

    hostPeer.ondatachannel = (e) => {
      console.log("[HostStream] Received incoming DataChannel from partner:", e.channel.label);
      wireChannel(e.channel);
    };

    hostPeer.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
        hostGatheredCandidates.push(c);
        // Only trickle candidates if gathering already completed and remote description is set
        if (hostPeer?.remoteDescription) {
          void Bridge.sendRemoteSignal({ type: "candidate", candidate: c });
        }
      }
    };

    // Create & dispatch SDP Offer to partner
    const offer = await hostPeer.createOffer();
    await hostPeer.setLocalDescription(offer);

    // Wait up to 700ms (or until gathering completes) so all host & STUN candidates are pre-gathered
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      if (hostPeer?.iceGatheringState === "complete") {
        finish();
        return;
      }
      const checkState = () => {
        if (hostPeer?.iceGatheringState === "complete") finish();
      };
      hostPeer?.addEventListener("icegatheringstatechange", checkState);
      setTimeout(finish, 700);
    });

    const resolution = { width: screenWidth, height: screenHeight };
    const offerPayload = {
      type: "offer",
      sdp: hostPeer.localDescription?.sdp || offer.sdp || "",
      candidates: hostGatheredCandidates.slice(),
    };

    // Also broadcast the offer signal as fallback
    await Bridge.sendRemoteSignal({
      type: "offer",
      sdp: offerPayload.sdp,
      candidates: offerPayload.candidates,
      resolution,
    });

    console.log("[HostStream] Started WebRTC screen sharing successfully. Pre-gathered candidates count:", hostGatheredCandidates.length);
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

      // If answer has pre-gathered candidates, add them immediately!
      if (signal.candidates && Array.isArray(signal.candidates)) {
        for (const c of signal.candidates) {
          try {
            await hostPeer.addIceCandidate(new RTCIceCandidate(c));
          } catch (candErr) {
            console.warn("[HostStream] Failed adding answer candidate:", candErr);
          }
        }
      }

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
      console.log("[HostStream] Viewer reported ready! Re-sending SDP Offer & gathered candidates in single payload...");
      if (hostPeer.localDescription) {
        await Bridge.sendRemoteSignal({
          type: "offer",
          sdp: hostPeer.localDescription.sdp,
          candidates: hostGatheredCandidates.slice(),
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
      try {
        track.stop();
      } catch (e) {}
    }
    hostStream = null;
  }
  if (inputChannel) {
    try {
      inputChannel.close();
    } catch (e) {}
    inputChannel = null;
  }
  if (hostPeer) {
    try {
      hostPeer.close();
    } catch (e) {}
    hostPeer = null;
  }
  hostGatheredCandidates = [];
  pendingViewerCandidates = [];
  console.log("[HostStream] Stopped screen sharing and closed peer connection");
}
