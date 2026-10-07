import {
  LocalTrack,
  RemoteTrackPublication,
  Track,
  VideoQuality,
} from "livekit-client";
import { LIVEKIT, ROOM_UI } from "$lib/constants";
import {
  onPiPVolumeChange,
  setAudioMuted,
  setAudioState,
  setAudioVolume,
} from "$lib/utils/audio";
import { publishData } from "$lib/utils/livekit-data";
import { createLogger } from "$lib/utils/logger";
import { connectionStore } from "./connection.svelte";
import { sharingStore } from "./sharing.svelte";
import type { UploadFps, UploadQuality, ViewQuality } from "./types";

const log = createLogger("Quality");

class QualityStore {
  quality = $state<ViewQuality>(LIVEKIT.DEFAULT_VIEW_QUALITY);
  streamQualities = $state<Record<string, ViewQuality>>({});
  uploadQuality = $state<UploadQuality>(LIVEKIT.DEFAULT_UPLOAD_QUALITY);
  uploadFps = $state<UploadFps>(LIVEKIT.DEFAULT_UPLOAD_FPS);
  remoteUploadQualities = $state<Record<string, UploadQuality>>({});
  remoteUploadFps = $state<Record<string, UploadFps>>({});
  remoteAudioMuted = $state<Record<string, boolean>>({});
  remoteAudioVolume = $state<Record<string, number>>({});

  qualityFor(participantSid: string | null): ViewQuality {
    if (participantSid === null) return this.quality;
    return this.streamQualities[participantSid] ?? this.quality;
  }

  setQuality(q: ViewQuality, participantSid: string | null = null): void {
    if (participantSid === null) {
      this.quality = q;
      return;
    }
    this.streamQualities = { ...this.streamQualities, [participantSid]: q };
    this.applyQuality(participantSid);
  }

  applyQuality(participantSid: string): void {
    if (!connectionStore.room) return;
    const q = this.qualityFor(participantSid);
    for (const participant of connectionStore.room.remoteParticipants.values()) {
      if (participant.sid !== participantSid) continue;
      for (const pub of participant.trackPublications.values()) {
        if (pub.kind !== Track.Kind.Video || pub.source !== Track.Source.ScreenShare)
          continue;
        if (!(pub instanceof RemoteTrackPublication)) continue;
        try {
          if (q === "auto") {
            pub.setVideoQuality(VideoQuality.HIGH);
          } else {
            const vq = LIVEKIT.VIEW_QUALITY_MAP[q];
            if (vq === undefined) throw new Error(`invalid_quality:${q}`);
            pub.setVideoQuality(vq);
          }
        } catch (err) {
          log.warn("set_video_quality_failed", err);
        }
      }
    }
  }

  async setUploadQuality(q: UploadQuality): Promise<void> {
    if (!connectionStore.room || !sharingStore.isSharing) {
      this.uploadQuality = q;
      return;
    }
    const screenPub = connectionStore.room.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    );
    if (!screenPub?.track || !(screenPub.track instanceof LocalTrack)) {
      this.uploadQuality = q;
      this.announceUploadQuality(q);
      return;
    }
    try {
      const mediaTrack = screenPub.track.mediaStreamTrack;
      if (mediaTrack) {
        const res = LIVEKIT.RESOLUTION_MAP[q];
        if (!res) throw new Error(`invalid_resolution:${q}`);
        await mediaTrack.applyConstraints(res);
      }
      this.uploadQuality = q;
      this.announceUploadQuality(q);
    } catch (err) {
      log.warn("apply_constraints_failed", err);
    }
  }

  async setUploadFps(fps: UploadFps): Promise<void> {
    if (!connectionStore.room || !sharingStore.isSharing) {
      this.uploadFps = fps;
      return;
    }
    const screenPub = connectionStore.room.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    );
    if (!screenPub?.track || !(screenPub.track instanceof LocalTrack)) {
      this.uploadFps = fps;
      this.announceUploadFps(fps);
      return;
    }
    try {
      const mediaTrack = screenPub.track.mediaStreamTrack;
      if (mediaTrack) {
        const fpsNum = parseInt(fps, 10);
        if (!Number.isFinite(fpsNum) || fpsNum <= 0) {
          throw new Error(`invalid_fps:${fps}`);
        }
        await mediaTrack.applyConstraints({ frameRate: fpsNum });
      }
      this.uploadFps = fps;
      this.announceUploadFps(fps);
    } catch (err) {
      log.warn("apply_constraints_failed", err);
    }
  }

  private announceUploadQuality(q: UploadQuality): void {
    publishData(connectionStore.room, {
      type: LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_QUALITY,
      quality: q,
    });
  }

  private announceUploadFps(fps: UploadFps): void {
    publishData(connectionStore.room, {
      type: LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_FPS,
      fps,
    });
  }

  toggleRemoteAudio(participantSid: string): void {
    const newMuted = !(this.remoteAudioMuted[participantSid] ?? false);
    setAudioMuted(participantSid, newMuted);
    this.remoteAudioMuted = { ...this.remoteAudioMuted, [participantSid]: newMuted };
    setAudioState(this.remoteAudioMuted, this.remoteAudioVolume);
  }

  setRemoteVolume(participantSid: string, volume: number): void {
    if (!Number.isFinite(volume)) return;
    const v = Math.max(
      ROOM_UI.AUDIO_VOLUME_MIN,
      Math.min(ROOM_UI.AUDIO_VOLUME_MAX, volume),
    );
    setAudioVolume(participantSid, v);
    if (v === 0) {
      setAudioMuted(participantSid, true);
      this.remoteAudioMuted = { ...this.remoteAudioMuted, [participantSid]: true };
    } else if (this.remoteAudioMuted[participantSid] ?? false) {
      setAudioMuted(participantSid, false);
      this.remoteAudioMuted = { ...this.remoteAudioMuted, [participantSid]: false };
    }
    this.remoteAudioVolume = { ...this.remoteAudioVolume, [participantSid]: v };
    setAudioState(this.remoteAudioMuted, this.remoteAudioVolume);
  }

  onPiPChange(participantSid: string, muted: boolean, volume: number): void {
    this.remoteAudioMuted = { ...this.remoteAudioMuted, [participantSid]: muted };
    this.remoteAudioVolume = { ...this.remoteAudioVolume, [participantSid]: volume };
    setAudioState(this.remoteAudioMuted, this.remoteAudioVolume);
  }

  removeRemoteAudio(participantSid: string): void {
    const { [participantSid]: _m, ...restMuted } = this.remoteAudioMuted;
    this.remoteAudioMuted = restMuted;
    const { [participantSid]: _v, ...restVol } = this.remoteAudioVolume;
    this.remoteAudioVolume = restVol;
    setAudioState(this.remoteAudioMuted, this.remoteAudioVolume);
  }

  setRemoteUploadQuality(participantSid: string, q: UploadQuality): void {
    if (!this.isRemoteParticipant(participantSid)) return;
    this.remoteUploadQualities = {
      ...this.remoteUploadQualities,
      [participantSid]: q,
    };
  }

  setRemoteUploadFps(participantSid: string, fps: UploadFps): void {
    if (!this.isRemoteParticipant(participantSid)) return;
    this.remoteUploadFps = { ...this.remoteUploadFps, [participantSid]: fps };
  }

  private isRemoteParticipant(participantSid: string): boolean {
    if (!connectionStore.room) return false;
    for (const p of connectionStore.room.remoteParticipants.values()) {
      if (p.sid === participantSid) return true;
    }
    return false;
  }

  removeRemoteQuality(participantSid: string): void {
    const { [participantSid]: _q, ...restQ } = this.remoteUploadQualities;
    this.remoteUploadQualities = restQ;
    const { [participantSid]: _f, ...restF } = this.remoteUploadFps;
    this.remoteUploadFps = restF;
    const { [participantSid]: _s, ...restS } = this.streamQualities;
    this.streamQualities = restS;
  }

  // Mesmo motivo do streamsStore.pruneDisconnected: evento com sid mutado
  // não alcança as entradas da sessão morta — remove por varredura.
  pruneDisconnected(live: Set<string>): void {
    const prune = <T>(rec: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(rec).filter(([sid]) => live.has(sid)));
    this.streamQualities = prune(this.streamQualities);
    this.remoteUploadQualities = prune(this.remoteUploadQualities);
    this.remoteUploadFps = prune(this.remoteUploadFps);
    this.remoteAudioMuted = prune(this.remoteAudioMuted);
    this.remoteAudioVolume = prune(this.remoteAudioVolume);
    setAudioState(this.remoteAudioMuted, this.remoteAudioVolume);
  }

  reset(): void {
    this.quality = LIVEKIT.DEFAULT_VIEW_QUALITY;
    this.streamQualities = {};
    this.uploadQuality = LIVEKIT.DEFAULT_UPLOAD_QUALITY;
    this.uploadFps = LIVEKIT.DEFAULT_UPLOAD_FPS;
    this.remoteUploadQualities = {};
    this.remoteUploadFps = {};
    this.remoteAudioMuted = {};
    this.remoteAudioVolume = {};
  }
}

export const qualityStore = new QualityStore();
onPiPVolumeChange((sid, muted, volume) =>
  qualityStore.onPiPChange(sid, muted, volume),
);
