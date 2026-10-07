import { SOUND, type SoundEvent } from "$lib/constants";
import { createLogger } from "./logger";

const log = createLogger("NotifySound");
let audioContext: AudioContext | null = null;
let initialized = false;
let destroyed = false;
const lastPlayed = new Map<SoundEvent, number>();
// Evento pedido com o contexto suspenso (autoplay policy pré-gesto):
// resume() resolve no 1º gesto do usuário e toca o mais recente — sem
// isso todo som disparado antes do primeiro clique era descartado.
let pending: { event: SoundEvent; at: number } | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || destroyed) return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      log.warn("audio_context_unsupported");
      return null;
    }
  }
  return audioContext;
}

function resumeContext(): void {
  const context = getContext();
  if (context?.state !== "suspended") return;
  context
    .resume()
    .then(() => {
      if (destroyed || context.state !== "running" || !pending) return;
      const { event, at } = pending;
      pending = null;
      if (performance.now() - at <= SOUND.PENDING_MAX_AGE_MS) {
        lastPlayed.set(event, performance.now());
        schedule(event, context);
      }
    })
    .catch((err) => log.warn("resume_failed", err));
}

export function resumeAudio(): void {
  resumeContext();
}

export function initNotifySound(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  destroyed = false;
  getContext();
  window.addEventListener("pointerdown", resumeContext);
  window.addEventListener("keydown", resumeContext);
}

export function destroyNotifySound(): void {
  destroyed = true;
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", resumeContext);
    window.removeEventListener("keydown", resumeContext);
  }
  audioContext?.close().catch((err) => log.warn("close_failed", err));
  audioContext = null;
  initialized = false;
  lastPlayed.clear();
  pending = null;
}

function schedule(event: SoundEvent, context: AudioContext): void {
  const start = context.currentTime;
  for (const note of SOUND.PATTERNS[event]) {
    const at = start + note.at;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.freq, at);
    if (note.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, at + note.dur);
    }
    gainNode.gain.setValueAtTime(0, at);
    gainNode.gain.linearRampToValueAtTime(note.gain, at + SOUND.FADE_IN_SEC);
    gainNode.gain.exponentialRampToValueAtTime(0.001, at + note.dur);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + note.dur);
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }
}

export function playEventSound(event: SoundEvent): void {
  const now = performance.now();
  const last = lastPlayed.get(event);
  if (last !== undefined && now - last < SOUND.BURST_WINDOW_MS) return;
  const context = getContext();
  if (!context || destroyed) return;
  if (context.state !== "running") {
    pending = { event, at: now };
    resumeContext();
    return;
  }
  lastPlayed.set(event, now);
  // Tocou direto — um pendente antigo não pode tocar por cima depois.
  pending = null;
  schedule(event, context);
}
