import {
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Track,
} from "livekit-client";
import { LIVEKIT } from "$lib/constants";
import { createLogger } from "$lib/utils/logger";
import { resumeAudio } from "$lib/utils/notify-sound";
import { connectionStore } from "./connection.svelte";
import { qualityStore } from "./quality.svelte";

const log = createLogger("Share");

class SharingStore {
  isSharing = $state(false);
  localAudioMuted = $state(false);
  switching = $state(false);
  starting = $state(false);

  async shareScreen(): Promise<void> {
    if (!connectionStore.room || this.isSharing || this.starting) return;
    resumeAudio();
    this.starting = true;
    try {
      await connectionStore.room.localParticipant.setScreenShareEnabled(true, {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: true,
      });
      const publication = connectionStore.room.localParticipant.getTrackPublication(
        Track.Source.ScreenShare,
      );
      if (publication?.track instanceof LocalTrack) {
        try {
          const track = publication.track.mediaStreamTrack;
          await track.applyConstraints(LIVEKIT.RESOLUTION_MAP[qualityStore.uploadQuality]);
          await track.applyConstraints({ frameRate: Number(qualityStore.uploadFps) });
        } catch (err) {
          log.warn("initial_constraints_failed", err);
        }
      }
      if (
        !(
          connectionStore.room.localParticipant.getTrackPublication(
            Track.Source.ScreenShareAudio,
          )?.track instanceof LocalAudioTrack
        )
      ) {
        log.warn("share_audio_absent");
      }
      this.isSharing = true;
      connectionStore.error = "";
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.message.includes("Permission denied"))
      )
        return;
      log.error("share_failed", err);
      connectionStore.error = "Erro ao compartilhar tela";
    } finally {
      this.starting = false;
    }
  }

  async stopShare(): Promise<void> {
    if (!connectionStore.room || this.starting) return;
    try {
      await connectionStore.room.localParticipant.setScreenShareEnabled(false);
      this.isSharing = false;
      this.localAudioMuted = false;
      connectionStore.error = "";
    } catch (err) {
      log.error("stop_share_failed", err);
      connectionStore.error = "Erro ao parar compartilhamento";
    }
  }

  async toggleLocalAudio(): Promise<void> {
    const publication = connectionStore.room?.localParticipant.getTrackPublication(
      Track.Source.ScreenShareAudio,
    );
    if (!(publication?.track instanceof LocalAudioTrack)) return;
    try {
      if (this.localAudioMuted) await publication.track.unmute();
      else await publication.track.mute();
      this.localAudioMuted = !this.localAudioMuted;
    } catch (err) {
      log.error("toggle_audio_failed", err);
    }
  }

  async switchScreen(): Promise<void> {
    const room = connectionStore.room;
    if (!room || !this.isSharing || this.switching) return;
    resumeAudio();
    this.switching = true;
    let stream: MediaStream | null = null;
    let videoAttached = false;
    let audioAttached = false;
    try {
      const videoPublication = room.localParticipant.getTrackPublication(
        Track.Source.ScreenShare,
      );
      if (!(videoPublication?.track instanceof LocalVideoTrack))
        throw new Error("screen_track_missing");
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const newVideo = stream.getVideoTracks()[0];
      if (!newVideo) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
        return;
      }
      try {
        await newVideo.applyConstraints(
          LIVEKIT.RESOLUTION_MAP[qualityStore.uploadQuality],
        );
      } catch (err) {
        log.warn("resolution_constraints_failed", err);
      }
      try {
        await newVideo.applyConstraints({ frameRate: Number(qualityStore.uploadFps) });
      } catch (err) {
        log.warn("fps_constraints_failed", err);
      }
      const oldVideo = videoPublication.track.mediaStreamTrack;
      await videoPublication.track.replaceTrack(newVideo);
      videoAttached = true;
      oldVideo.stop();

      const newAudio = stream.getAudioTracks()[0];
      const audioPublication = room.localParticipant.getTrackPublication(
        Track.Source.ScreenShareAudio,
      );
      if (audioPublication?.track instanceof LocalAudioTrack) {
        if (newAudio) {
          const oldAudio = audioPublication.track.mediaStreamTrack;
          await audioPublication.track.replaceTrack(newAudio);
          audioAttached = true;
          oldAudio.stop();
        } else {
          await room.localParticipant.unpublishTrack(audioPublication.track, true);
        }
      } else if (newAudio) {
        await room.localParticipant.publishTrack(newAudio, {
          source: Track.Source.ScreenShareAudio,
        });
        audioAttached = true;
      }
      connectionStore.error = "";
    } catch (err) {
      if (!(err instanceof Error && err.name === "NotAllowedError")) {
        log.error("switch_failed", err);
        connectionStore.error = "Erro ao trocar tela";
      }
      for (const track of stream?.getVideoTracks() ?? []) {
        if (!videoAttached) track.stop();
      }
      for (const track of stream?.getAudioTracks() ?? []) {
        if (!audioAttached) track.stop();
      }
    } finally {
      this.switching = false;
    }
  }

  reset(): void {
    this.isSharing = false;
    this.localAudioMuted = false;
    this.switching = false;
    this.starting = false;
  }
}

export const sharingStore = new SharingStore();
