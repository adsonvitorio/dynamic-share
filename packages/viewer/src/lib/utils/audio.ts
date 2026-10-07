import type { RemoteTrack } from "livekit-client";
import { ROOM_UI } from "$lib/constants";
import { createLogger } from "./logger";

const log = createLogger("Audio");
const audioTracks = new Map<string, RemoteTrack>();
const videoListeners = new Map<string, () => void>();
const suppressedSids = new Set<string>();
let mutedState: Record<string, boolean> = {};
let volumeState: Record<string, number> = {};
let pipChangeCallback: ((sid: string, muted: boolean, volume: number) => void) | null = null;

// O listener de volumechange do <video> existe para capturar input de
// PiP — mas o SDK também escreve el.muted nos attaches (attachToElement
// força muted=true quando o stream não tem faixa de áudio). Sem a
// supressão, writes nossos e do SDK voltam como se fossem input do
// usuário e poluem remoteAudioMuted (ícone mutado com áudio audível).
export function withVideoSyncSuppressed<T>(sid: string, fn: () => T): T {
  suppressedSids.add(sid);
  try {
    return fn();
  } finally {
    suppressedSids.delete(sid);
  }
}

function getAudioEl(sid: string): HTMLAudioElement | null {
  const element = document.getElementById(`audio-${sid}`);
  return element instanceof HTMLAudioElement ? element : null;
}

function getVideoEl(sid: string): HTMLVideoElement | null {
  const element = document.getElementById(`video-${sid}`);
  return element instanceof HTMLVideoElement ? element : null;
}

export function onPiPVolumeChange(
  callback: (sid: string, muted: boolean, volume: number) => void,
): void {
  pipChangeCallback = callback;
}

export function setAudioState(muted: Record<string, boolean>, volume: Record<string, number>): void {
  mutedState = muted;
  volumeState = volume;
}

function syncAudioToVideo(sid: string, video: HTMLMediaElement | null): void {
  const audio = getAudioEl(sid);
  if (!audio || !video) return;
  withVideoSyncSuppressed(sid, () => {
    video.muted = audio.muted;
    video.volume = audio.volume;
  });
}

export function cleanupVideoSync(sid: string): void {
  videoListeners.get(sid)?.();
  videoListeners.delete(sid);
}

function setupVideoSync(sid: string, video: HTMLMediaElement | null): void {
  cleanupVideoSync(sid);
  if (!video) return;
  const onVolumeChange = (): void => {
    if (suppressedSids.has(sid)) return;
    const audio = getAudioEl(sid);
    if (!audio) return;
    audio.muted = video.muted;
    audio.volume = video.volume;
    pipChangeCallback?.(sid, video.muted, video.volume);
  };
  video.addEventListener("volumechange", onVolumeChange);
  videoListeners.set(sid, () => video.removeEventListener("volumechange", onVolumeChange));
}

export function syncVideoElement(sid: string, video?: HTMLMediaElement | null): void {
  const el = video ?? getVideoEl(sid);
  syncAudioToVideo(sid, el);
  setupVideoSync(sid, el);
}

export function attachScreenShareAudio(sid: string, track: RemoteTrack): void {
  const previous = audioTracks.get(sid);
  const existing = getAudioEl(sid);
  if (previous && existing) {
    try {
      previous.detach(existing);
    } catch (err) {
      log.warn("detach_previous_failed", err);
    }
  }
  const audio = existing ?? document.createElement("audio");
  if (!existing) {
    audio.id = `audio-${sid}`;
    audio.autoplay = true;
    audio.style.display = "none";
    document.body.appendChild(audio);
  }
  audio.volume = volumeState[sid] ?? ROOM_UI.AUDIO_VOLUME_MAX;
  try {
    track.attach(audio);
    audioTracks.set(sid, track);
  } catch (err) {
    log.warn("attach_failed", err);
  }
  // attachToElement do SDK força el.muted=false quando o stream tem
  // faixa de áudio — a preferência local do viewer precisa vir depois.
  audio.muted = mutedState[sid] ?? false;
  audio.play().catch((err: unknown) => log.warn("autoplay_blocked", err));
  syncVideoElement(sid);
}

export function detachScreenShareAudio(sid: string): void {
  const track = audioTracks.get(sid);
  const audio = getAudioEl(sid);
  if (track && audio) {
    try {
      track.detach(audio);
    } catch (err) {
      log.warn("detach_failed", err);
    }
  }
  audioTracks.delete(sid);
  cleanupVideoSync(sid);
  audio?.remove();
}

export function detachAllAudio(): void {
  for (const sid of [...audioTracks.keys()]) detachScreenShareAudio(sid);
  for (const sid of [...videoListeners.keys()]) cleanupVideoSync(sid);
  mutedState = {};
  volumeState = {};
}

// Sid do evento pode ser o da sessão nova quando o SDK muta o participante
// in-place (rejoin com mesma identity) — os elementos da sessão morta
// precisam sair por varredura, não pelo sid do evento.
export function pruneScreenShareAudio(liveSids: Set<string>): void {
  for (const sid of [...audioTracks.keys()]) {
    if (!liveSids.has(sid)) detachScreenShareAudio(sid);
  }
  for (const sid of [...videoListeners.keys()]) {
    if (!liveSids.has(sid)) cleanupVideoSync(sid);
  }
}

export function setAudioMuted(sid: string, muted: boolean): void {
  const audio = getAudioEl(sid);
  const video = getVideoEl(sid);
  if (audio) audio.muted = muted;
  if (video) {
    withVideoSyncSuppressed(sid, () => {
      video.muted = muted;
    });
  }
}

export function setAudioVolume(sid: string, volume: number): void {
  const value = Math.max(ROOM_UI.AUDIO_VOLUME_MIN, Math.min(ROOM_UI.AUDIO_VOLUME_MAX, volume));
  const audio = getAudioEl(sid);
  const video = getVideoEl(sid);
  if (audio) audio.volume = value;
  if (video) {
    withVideoSyncSuppressed(sid, () => {
      video.volume = value;
    });
  }
}
