// Speech Recognition (Voice Input via Groq Whisper) & Speech Synthesis (Kokoro TTS) for Mochi
import { Bridge } from "./bridge";
import { Sound } from "./sound";
import { State } from "./state";

function float32ToWavBlob(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isWhisperHallucination(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 2) return true;
  if (/^[\[\(].*[\]\)]$/.test(t)) return true;
  if (/^[*].*[*]$/.test(t)) return true;

  const clean = t.replace(/[^a-z0-9 ]/g, "").trim();
  const hallucinations = new Set([
    "thank you",
    "thank you so much",
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
    "like and subscribe",
    "subscribe to my channel",
    "see you next time",
    "see you in the next video",
    "see you later",
    "bye",
    "bye bye",
    "goodbye",
    "you",
    "oh",
    "ah",
    "huh",
    "yeah",
    "okay",
    "subtitles by",
    "translated by",
    "closed captions",
    "silence",
    "music",
    "applause",
    "laughter",
  ]);
  if (hallucinations.has(clean)) return true;
  if (clean.length <= 1) return true;

  return false;
}

class VoiceService {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isListening = false;
  private isSpeaking = false;
  private isProcessing = false;
  private onQuerySent?: () => void;

  // Voice Activity Detection (VAD) buffers & pre-roll
  private audioChunks: Float32Array[] = [];
  private preRollBuffer: Float32Array[] = [];
  private readonly PRE_ROLL_LIMIT = 3; // Keep ~384ms before speech so first syllables are never cut
  private silenceFrames = 0;
  private speakingFrames = 0;
  private ambientNoiseRms = 0.015;
  private readonly MIN_SPEECH_FRAMES = 4; // Require at least ~500ms of real voice to avoid random clicks
  private readonly SILENCE_FRAMES_LIMIT = 8; // ~1000ms silence to finish sentence (responsive & clean)

  init(onQuerySent?: () => void) {
    this.onQuerySent = onQuerySent;

    if (State.settings.micEnabled ?? true) {
      void this.start();
    }
  }

  async start() {
    if (this.isListening) return;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      if (this.audioCtx && this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
        } catch {}
      }

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      // 2048 buffer size at 16000Hz ≈ 128ms per frame
      this.processor = this.audioCtx.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (this.isSpeaking || this.isProcessing) {
          this.audioChunks = [];
          this.silenceFrames = 0;
          this.speakingFrames = 0;
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        // Dynamically compute speech threshold based on room background noise
        const dynamicThreshold = Math.max(0.026, this.ambientNoiseRms * 2.4);

        if (rms > dynamicThreshold) {
          if (this.speakingFrames === 0) {
            // Speech just started! Prepend pre-roll buffer so starting consonant is intact!
            this.audioChunks = this.preRollBuffer.map((b) => new Float32Array(b));
          }
          this.speakingFrames++;
          this.silenceFrames = 0;
          this.audioChunks.push(new Float32Array(inputData));
        } else {
          // Track ambient room background noise adaptively when quiet
          this.ambientNoiseRms = this.ambientNoiseRms * 0.95 + rms * 0.05;

          // Maintain pre-roll circular buffer when not speaking
          if (this.speakingFrames === 0) {
            this.preRollBuffer.push(new Float32Array(inputData));
            if (this.preRollBuffer.length > this.PRE_ROLL_LIMIT) {
              this.preRollBuffer.shift();
            }
          } else {
            // Currently recording speech and this frame is quiet
            this.audioChunks.push(new Float32Array(inputData));
            this.silenceFrames++;

            if (this.silenceFrames >= this.SILENCE_FRAMES_LIMIT) {
              // Sentence ended
              if (this.speakingFrames >= this.MIN_SPEECH_FRAMES) {
                void this.handleSpeechComplete();
              } else {
                // Was just a quick click, breath, or tap: discard
                this.audioChunks = [];
                this.silenceFrames = 0;
                this.speakingFrames = 0;
              }
            }
          }
        }
      };

      source.connect(this.processor);
      // Mute gain node ensures microphone audio is analyzed by the processor but NEVER sent to the speakers!
      const muteGain = this.audioCtx.createGain();
      muteGain.gain.value = 0;
      this.processor.connect(muteGain);
      muteGain.connect(this.audioCtx.destination);

      this.isListening = true;
      console.log("[Voice] Microphone VAD active and listening (muted monitor loop)!");
    } catch (err) {
      console.warn("[Voice] Failed to start microphone:", err);
      this.isListening = false;
    }
  }

  stop() {
    this.isListening = false;
    this.audioChunks = [];
    this.preRollBuffer = [];
    this.silenceFrames = 0;
    this.speakingFrames = 0;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
  }

  private async handleSpeechComplete() {
    if (this.audioChunks.length === 0 || this.isProcessing) return;
    this.isProcessing = true;

    // Combine all chunks into one Float32Array
    const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const mergedSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    // Reset buffer
    this.audioChunks = [];
    this.silenceFrames = 0;
    this.speakingFrames = 0;

    try {
      const wavBlob = float32ToWavBlob(mergedSamples, 16000);
      const base64 = await blobToBase64(wavBlob);

      const res = await Bridge.transcribeAudio(base64);
      if (!res.success || !res.text) return;

      const transcript = res.text.trim();
      // Drop silence artifacts and Whisper hallucinations
      if (isWhisperHallucination(transcript)) {
        console.log("[Voice] Ignored hallucination / background noise:", transcript);
        return;
      }

      console.log("[Voice Heard]:", transcript);

      // Keep user on whatever view they are currently on! Do not switch tabs.
      State.chatHistory.push({ id: Date.now(), role: "user", content: transcript });
      Sound.play("think");
      State.stateOverride = "thinking";
      State.notify();
      if (this.onQuerySent) this.onQuerySent();

      // Call AI Engine (Groq / Gemini)
      const reply = await Bridge.chatSend(transcript, null);
      State.chatHistory.push({ id: Date.now() + 1, role: "assistant", content: reply.text });
      State.stateOverride = "finished";
      State.triggerEmote("happy");
      Sound.play("finish");
      State.notify();
      if (this.onQuerySent) this.onQuerySent();

      // Speak the reply out loud instantly with natural speech
      await this.speak(reply.text);
    } catch (err) {
      console.error("[Voice] Transcription / response error:", err);
      State.stateOverride = "error";
      Sound.play("error");
      setTimeout(() => {
        State.stateOverride = null;
        State.notify();
      }, 2000);
    } finally {
      this.isProcessing = false;
    }
  }

  async speak(text: string) {
    const cleanSpoken = cleanForSpeech(text);
    if (!cleanSpoken) return;

    this.isSpeaking = true;
    State.stateOverride = "finished";
    State.notify();

    // 1. Instant Web Speech API (runs in Chromium audio thread, 15ms start, 0% CPU block)
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanSpoken);
        utter.rate = 1.02;
        utter.pitch = 1.12; // warm, friendly, cute Mochi pitch

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find(
            (v) =>
              v.name.includes("Natural") ||
              v.name.includes("Jenny") ||
              v.name.includes("Aria") ||
              v.name.includes("Zira") ||
              (v.lang.startsWith("en") &&
                (v.name.toLowerCase().includes("female") || v.name.includes("Desktop")))
          ) || voices.find((v) => v.lang.startsWith("en"));

        if (preferred) utter.voice = preferred;

        await new Promise<void>((resolve) => {
          let finished = false;
          const done = () => {
            if (!finished) {
              finished = true;
              this.audioChunks = [];
              this.silenceFrames = 0;
              this.speakingFrames = 0;
              // 800ms cooldown before listening again to prevent room echo or speaker tail
              setTimeout(() => {
                this.audioChunks = [];
                this.silenceFrames = 0;
                this.speakingFrames = 0;
                this.isSpeaking = false;
                State.stateOverride = null;
                State.notify();
                resolve();
              }, 800);
            }
          };
          utter.onend = done;
          utter.onerror = done;
          // Safety timeout in case speech engine stalls
          const words = cleanSpoken.split(/\s+/).length;
          const maxMs = Math.max(2500, words * 700);
          setTimeout(done, maxMs);

          window.speechSynthesis.speak(utter);
        });

        return;
      } catch (e) {
        console.warn("[Voice] Web Speech failed, trying native SAPI:", e);
      }
    }

    // 2. Windows Native SAPI fallback (cscript out-of-process, 50ms start, 0% CPU block)
    try {
      await Bridge.speakNative(cleanSpoken);
    } catch (err) {
      console.warn("[Voice] Native SAPI error:", err);
    } finally {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          this.audioChunks = [];
          this.silenceFrames = 0;
          this.speakingFrames = 0;
          this.isSpeaking = false;
          State.stateOverride = null;
          State.notify();
          resolve();
        }, 800);
      });
    }
  }
}

/** Converts formatted AI text, markdown, timestamps, and emojis into natural spoken words */
export function cleanForSpeech(rawText: string): string {
  if (!rawText) return "";

  let s = rawText;

  // 1. Remove command tags [LAUNCH:...], [ADD_TASK:...], [MARK_DONE:...]
  s = s.replace(/\[[A-Z_]+:[^\]]*\]/gi, "");

  // 2. Strip code blocks and inline code
  s = s.replace(/```[\s\S]*?```/g, "");
  s = s.replace(/`([^`]+)`/g, "$1");

  // 3. Strip markdown headers, blockquotes, bold, italics, strikethrough
  s = s.replace(/^[#>\s*+-]+ /gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/~~([^~]+)~/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 4. Strip ALL emojis and symbol pictographs
  s = s.replace(
    /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu,
    ""
  );

  // 5. Clean up times for natural speech: 11:00 AM -> 11 AM, 03:30 PM -> 3:30 PM
  s = s.replace(/\b0?(\d{1,2}):00\s*(AM|PM)\b/gi, "$1 $2");
  s = s.replace(/\b0?(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, "$1:$2 $3");

  // 6. Convert bullet lists with times or pending/done status to natural speech
  s = s.replace(
    /^[•·\*\-]\s*(?:(?:Pending|Done|Completed|TODO)\s*[:\-]\s*)?(?:(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*[-–—:]*\s*)?/gim,
    (_m, t) => {
      return t ? `At ${t}, ` : "";
    }
  );

  // 7. Replace standalone symbols with words
  s = s.replace(/&/g, " and ");
  s = s.replace(/@/g, " at ");
  s = s.replace(/\bw\//gi, " with ");
  s = s.replace(/\bvs\.?\b/gi, " versus ");

  // 8. Remove parentheses/brackets
  s = s.replace(/[()\[\]{}]/g, " ");

  // 9. Replace standalone dashes/colons used as separators (preserve intra-word hyphens like to-do)
  s = s.replace(/\s+[-–—]\s+/g, ", ");
  s = s.replace(/:\s+/g, ", ");

  // 10. Split by line and combine into natural flowing sentences
  s = s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(". ");

  // 11. Normalize multiple punctuation marks & whitespace
  s = s.replace(/[,;.]\s*[,;.]+/g, ".");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export const VoiceManager = new VoiceService();
