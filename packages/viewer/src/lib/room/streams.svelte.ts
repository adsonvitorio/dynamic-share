import {
  RemoteTrackPublication,
  Track,
  type Participant,
} from "livekit-client";
import { LIVEKIT, ROOM_UI } from "$lib/constants";
import { auth } from "$lib/auth/auth.svelte";
import {
  cleanupVideoSync,
  pruneScreenShareAudio,
  syncVideoElement,
  withVideoSyncSuppressed,
} from "$lib/utils/audio";
import { parseAvatarUrl } from "$lib/utils/avatar";
import { exitFullscreen, exitPiP } from "$lib/utils/dom";
import { publishData } from "$lib/utils/livekit-data";
import { createLogger } from "$lib/utils/logger";
import { playEventSound } from "$lib/utils/notify-sound";
import { sanitizeDisplayName } from "$lib/utils/text";
import { connectionStore } from "./connection.svelte";
import { notifications } from "./notifications.svelte";
import type { AvailableStream, StreamViewer, VideoCard } from "./types";

const log = createLogger("Streams");

function getRemoteScreenSharePub(
  participant: Participant,
): RemoteTrackPublication | undefined {
  const pub = participant.getTrackPublication(Track.Source.ScreenShare);
  return pub instanceof RemoteTrackPublication ? pub : undefined;
}

function getRemoteScreenShareAudioPub(
  participant: Participant,
): RemoteTrackPublication | undefined {
  const pub = participant.getTrackPublication(Track.Source.ScreenShareAudio);
  return pub instanceof RemoteTrackPublication ? pub : undefined;
}

class StreamsStore {
  videoCards = $state<VideoCard[]>([]);
  availableStreams = $state<AvailableStream[]>([]);
  subscribedSids = $state<Set<string>>(new Set());
  streamViewers = $state<Record<string, StreamViewer[]>>({});
  hasAudioTrack = $state<Record<string, boolean>>({});
  focusedSid = $state<string | null>(null);

  private rafIds = new Map<string, number>();
  private rafCancelTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reannounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private attachedTracks = new Map<string, Track>();

  private get userName(): string {
    return connectionStore.userName;
  }

  private get localAvatar(): string | null {
    return auth.user?.avatarUrl ?? null;
  }

  private resolveName(participant: Participant, isLocal: boolean): string {
    const fallback = isLocal ? this.userName : participant.identity;
    return sanitizeDisplayName(participant.name ?? fallback) || participant.identity;
  }

  addAvailableStream(participant: Participant, isLocal = false): void {
    const entry: AvailableStream = {
      participantSid: participant.sid,
      identity: participant.identity,
      name: this.resolveName(participant, isLocal),
      isLocal,
      avatarUrl: isLocal ? this.localAvatar : parseAvatarUrl(participant.metadata),
    };
    this.availableStreams = [
      ...this.availableStreams.filter((s) => s.participantSid !== participant.sid),
      entry,
    ];
  }

  removeAvailableStream(participant: Participant): void {
    this.removeAvailableStreamBySid(participant.sid);
  }

  private removeAvailableStreamBySid(sid: string): void {
    this.availableStreams = this.availableStreams.filter(
      (s) => s.participantSid !== sid,
    );
  }

  updateAvailableStream(participant: Participant): void {
    const avatarUrl = parseAvatarUrl(participant.metadata);
    this.availableStreams = this.availableStreams.map((stream) =>
      stream.participantSid === participant.sid ? { ...stream, avatarUrl } : stream,
    );
    this.videoCards = this.videoCards.map((card) =>
      card.participantSid === participant.sid ? { ...card, avatarUrl } : card,
    );
  }

  setHasAudio(participantSid: string, has: boolean): void {
    this.hasAudioTrack = { ...this.hasAudioTrack, [participantSid]: has };
  }

  removeHasAudio(participantSid: string): void {
    const { [participantSid]: _, ...rest } = this.hasAudioTrack;
    this.hasAudioTrack = rest;
  }

  addVideoCard(participant: Participant, track: Track, isLocal: boolean): void {
    const card: VideoCard = {
      participantSid: participant.sid,
      identity: participant.identity,
      name: this.resolveName(participant, isLocal),
      isLocal,
      isScreenShare: true,
      avatarUrl: isLocal ? this.localAvatar : parseAvatarUrl(participant.metadata),
    };
    const exists = this.videoCards.some((c) => c.participantSid === participant.sid);
    this.videoCards = exists
      ? this.videoCards.map((c) => (c.participantSid === participant.sid ? card : c))
      : [...this.videoCards, card];

    const prevRafId = this.rafIds.get(participant.sid);
    if (prevRafId !== undefined) cancelAnimationFrame(prevRafId);
    const prevTimer = this.rafCancelTimers.get(participant.sid);
    if (prevTimer) clearTimeout(prevTimer);

    const sid = participant.sid;
    // Track no mapa antes do mount — o use:videoAttach attacha assim que o
    // elemento existe, sem depender de rAF (que não dispara em aba em
    // background — o caso clássico ao compartilhar outra aba).
    this.attachedTracks.get(sid)?.detach();
    this.attachedTracks.set(sid, track);
    const tryAttach = (attempt: number): void => {
      const element = document.getElementById(`video-${sid}`);
      if (
        element instanceof HTMLMediaElement &&
        this.videoCards.some((c) => c.participantSid === sid)
      ) {
        try {
          withVideoSyncSuppressed(sid, () => {
            track.detach(element);
            track.attach(element);
          });
          syncVideoElement(sid, element);
        } catch (err) {
          log.warn("attach_failed", err);
        }
        this.rafIds.delete(sid);
        return;
      }
      if (attempt < LIVEKIT.RAF_RETRY_MAX) {
        this.rafIds.set(
          sid,
          requestAnimationFrame(() => tryAttach(attempt + 1)),
        );
      } else {
        log.warn("attach_element_missing", { sid });
        this.rafIds.delete(sid);
      }
    };
    // Tentativa síncrona primeiro — republish com elemento já montado não
    // precisa esperar rAF (e em aba backgrounded o rAF não dispara).
    tryAttach(0);
    const timer = setTimeout(() => {
      const pending = this.rafIds.get(sid);
      if (pending !== undefined) cancelAnimationFrame(pending);
      this.rafCancelTimers.delete(sid);
      this.rafIds.delete(sid);
    }, LIVEKIT.RAF_CANCEL_TIMEOUT_MS);
    this.rafCancelTimers.set(sid, timer);
  }

  /**
   * Dims da track sem depender de frame decodificado — quando a aba do app
   * está em background o Chrome suspende o decode e videoWidth fica 0
   * ("Conectando" eterno do apresentador). getSettings() vem da captura.
   */
  trackDims(sid: string): { width: number; height: number } | undefined {
    const mst = this.attachedTracks.get(sid)?.mediaStreamTrack;
    const s = mst?.getSettings?.();
    return s?.width && s?.height ? { width: s.width, height: s.height } : undefined;
  }

  attachVideoElement(sid: string, el: HTMLMediaElement): void {
    const track = this.attachedTracks.get(sid);
    if (!track) return;
    try {
      withVideoSyncSuppressed(sid, () => {
        track.detach(el);
        track.attach(el);
      });
      syncVideoElement(sid, el);
    } catch (err) {
      log.warn("attach_failed", err);
    }
  }

  detachVideoElement(sid: string, el: HTMLMediaElement): void {
    cleanupVideoSync(sid);
    const track = this.attachedTracks.get(sid);
    if (!track) return;
    try {
      track.detach(el);
    } catch (err) {
      log.warn("detach_failed", err);
    }
  }

  releaseMediaOverlays(): void {
    exitPiP();
    exitFullscreen();
  }

  removeVideoCard(participant: Participant): void {
    this.removeVideoCardBySid(participant.sid);
  }

  private removeVideoCardBySid(sid: string): void {
    const rafId = this.rafIds.get(sid);
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      this.rafIds.delete(sid);
    }
    const timer = this.rafCancelTimers.get(sid);
    if (timer) {
      clearTimeout(timer);
      this.rafCancelTimers.delete(sid);
    }
    const pipVideo = document.pictureInPictureElement;
    if (
      pipVideo instanceof HTMLVideoElement &&
      pipVideo.id === `video-${sid}`
    ) {
      document.exitPictureInPicture().catch((err) => log.warn("pip_exit_failed", err));
    }
    const el = document.getElementById(`video-${sid}`);
    if (el instanceof HTMLMediaElement) {
      try {
        const track = this.attachedTracks.get(sid);
        if (track instanceof Track) {
          track.detach(el);
        } else if (el.srcObject) {
          el.srcObject = null;
        }
      } catch (err) {
        log.warn("detach_failed", err);
      }
    }
    this.attachedTracks.delete(sid);
    this.videoCards = this.videoCards.filter((c) => c.participantSid !== sid);
  }

  /**
   * Rejoin com a mesma identity (duplicate_identity em outra aba): o SDK
   * reusa o objeto do participante via updateInfo — o sid muta para a
   * sessão nova — e o ParticipantDisconnected/Unpublished da sessão morta
   * chega com o sid NOVO. Remover só pelo sid do evento deixava o card da
   * sessão velha fantasma. Varredura: todo sid que não está entre os
   * participantes vivos sai de todas as coleções.
   */
  pruneDisconnected(live: Set<string>): void {
    for (const card of [...this.videoCards]) {
      if (!live.has(card.participantSid)) this.removeVideoCardBySid(card.participantSid);
    }
    for (const stream of [...this.availableStreams]) {
      if (!live.has(stream.participantSid)) {
        this.removeAvailableStreamBySid(stream.participantSid);
      }
    }
    let subsChanged = false;
    for (const sid of this.subscribedSids) {
      if (!live.has(sid)) {
        this.subscribedSids.delete(sid);
        subsChanged = true;
      }
    }
    if (subsChanged) this.subscribedSids = new Set(this.subscribedSids);
    for (const sid of Object.keys(this.hasAudioTrack)) {
      if (!live.has(sid)) this.removeHasAudio(sid);
    }
    for (const sid of Object.keys(this.streamViewers)) {
      if (!live.has(sid)) this.removeStreamViewers(sid);
    }
    if (this.focusedSid !== null && !live.has(this.focusedSid)) this.focusedSid = null;
    pruneScreenShareAudio(live);
  }

  private async setScreenShareSubscription(
    participant: Participant,
    subscribed: boolean,
  ): Promise<void> {
    const videoPub = getRemoteScreenSharePub(participant);
    if (videoPub) await videoPub.setSubscribed(subscribed);
    const audioPub = getRemoteScreenShareAudioPub(participant);
    if (audioPub) await audioPub.setSubscribed(subscribed);
  }

  private findRemoteParticipant(sid: string): Participant | undefined {
    if (!connectionStore.room) return undefined;
    return [...connectionStore.room.remoteParticipants.values()].find(
      (p) => p.sid === sid,
    );
  }

  async toggleSubscribe(sid: string): Promise<void> {
    const participant = this.findRemoteParticipant(sid);
    if (!participant) return;
    const subscribing = !this.subscribedSids.has(sid);
    try {
      await this.setScreenShareSubscription(participant, subscribing);
      this.announceViewership(sid, subscribing);
      void playEventSound(subscribing ? "streamOpen" : "streamClose");
    } catch (err) {
      log.warn("toggle_subscription_failed", err);
    }
  }

  async openStream(sid: string): Promise<void> {
    const participant = this.findRemoteParticipant(sid);
    if (participant && !this.subscribedSids.has(sid)) {
      try {
        await this.setScreenShareSubscription(participant, true);
        this.announceViewership(sid, true);
        void playEventSound("streamOpen");
      } catch (err) {
        log.warn("subscribe_failed", err);
      }
    }
    this.focusedSid = sid;
  }

  addSubscribed(sid: string): void {
    this.subscribedSids.add(sid);
    this.subscribedSids = new Set(this.subscribedSids);
  }

  removeSubscribed(sid: string): void {
    this.subscribedSids.delete(sid);
    this.subscribedSids = new Set(this.subscribedSids);
  }

  announceViewership(streamSid: string, watching: boolean): void {
    if (!connectionStore.room) return;
    publishData(connectionStore.room, {
      type: LIVEKIT.DATA_MESSAGE_TYPES.VIEWERSHIP,
      streamSid,
      watching,
    });
    // O próprio viewer aparece na lista — data messages só chegam aos
    // remotos, então o estado local precisa ser atualizado aqui.
    this.setLocalViewer(streamSid, watching);
    // Re-anúncio tardio do estado ATUAL: pacotes de data channel que chegam
    // ao sharer antes do join do viewer ser processado são descartados
    // (remetente não verificável) — sem isso a contagem ficava perdida.
    clearTimeout(this.reannounceTimers.get(streamSid));
    this.reannounceTimers.set(
      streamSid,
      setTimeout(() => {
        this.reannounceTimers.delete(streamSid);
        publishData(connectionStore.room, {
          type: LIVEKIT.DATA_MESSAGE_TYPES.VIEWERSHIP,
          streamSid,
          watching: this.subscribedSids.has(streamSid),
        });
      }, LIVEKIT.VIEWERSHIP_REANNOUNCE_MS),
    );
  }

  private setLocalViewer(streamSid: string, watching: boolean): void {
    const local = connectionStore.room?.localParticipant;
    if (!local) return;
    let viewers = this.streamViewers[streamSid] ?? [];
    const has = viewers.some((v) => v.identity === local.identity);
    if (watching === has) return;
    viewers = watching
      ? [
          {
            name: this.userName || ROOM_UI.DEFAULT_LOCAL_NAME,
            identity: local.identity,
            avatarUrl: this.localAvatar,
          },
          ...viewers,
        ]
      : viewers.filter((v) => v.identity !== local.identity);
    this.streamViewers[streamSid] = viewers;
    this.streamViewers = { ...this.streamViewers };
  }

  updateViewership(
    participant: Participant,
    streamSid: string,
    watching: boolean,
  ): void {
    const knownSids = new Set(this.availableStreams.map((s) => s.participantSid));
    const localSid = connectionStore.room?.localParticipant.sid;
    if (localSid) knownSids.add(localSid);
    if (!knownSids.has(streamSid)) return;

    // Nome/avatar sempre do participant — vem do JWT assinado pelo server,
    // nunca do payload do data channel (controlável por qualquer um).
    const viewer: StreamViewer = {
      name:
        sanitizeDisplayName(participant.name ?? participant.identity) ||
        participant.identity,
      identity: participant.identity,
      avatarUrl: parseAvatarUrl(participant.metadata),
    };
    let viewers = this.streamViewers[streamSid] ?? [];
    const wasViewer = viewers.some((item) => item.identity === viewer.identity);
    const isWatching = streamSid === localSid || this.subscribedSids.has(streamSid);
    if (watching) {
      if (!wasViewer) {
        viewers = [...viewers, viewer];
        if (streamSid === localSid) {
          notifications.notify("viewer_join", {
            name: viewer.name,
            avatarUrl: viewer.avatarUrl,
          });
        } else if (isWatching) {
          notifications.notify("coviewer_join", {
            name: viewer.name,
            avatarUrl: viewer.avatarUrl,
          });
        }
      }
    } else if (wasViewer) {
      const stored = viewers.find((item) => item.identity === viewer.identity);
      viewers = viewers.filter((item) => item.identity !== viewer.identity);
      if (streamSid === localSid) {
        notifications.notify("viewer_leave", {
          name: stored?.name ?? viewer.name,
          avatarUrl: stored?.avatarUrl ?? viewer.avatarUrl,
        });
      } else if (isWatching) {
        notifications.notify("coviewer_leave", {
          name: stored?.name ?? viewer.name,
          avatarUrl: stored?.avatarUrl ?? viewer.avatarUrl,
        });
      }
    }
    this.streamViewers[streamSid] = viewers;
    this.streamViewers = { ...this.streamViewers };
  }

  removeViewerFromAll(identity: string): void {
    const localSid = connectionStore.room?.localParticipant.sid;
    for (const streamSid of Object.keys(this.streamViewers)) {
      const viewers = this.streamViewers[streamSid];
      const leaving = viewers.find((viewer) => viewer.identity === identity);
      if (leaving) {
        this.streamViewers[streamSid] = viewers.filter(
          (viewer) => viewer.identity !== identity,
        );
        if (streamSid === localSid) {
          notifications.notify("viewer_leave", {
            name: leaving.name,
            avatarUrl: leaving.avatarUrl,
          });
        } else if (this.subscribedSids.has(streamSid)) {
          notifications.notify("coviewer_leave", {
            name: leaving.name,
            avatarUrl: leaving.avatarUrl,
          });
        }
      }
    }
    this.streamViewers = { ...this.streamViewers };
  }

  updateViewersAvatar(participant: Participant): void {
    const avatarUrl = parseAvatarUrl(participant.metadata);
    let changed = false;
    for (const streamSid of Object.keys(this.streamViewers)) {
      if (
        this.streamViewers[streamSid].some(
          (viewer) =>
            viewer.identity === participant.identity &&
            viewer.avatarUrl !== avatarUrl,
        )
      ) {
        this.streamViewers[streamSid] = this.streamViewers[streamSid].map((viewer) =>
          viewer.identity === participant.identity ? { ...viewer, avatarUrl } : viewer,
        );
        changed = true;
      }
    }
    if (changed) this.streamViewers = { ...this.streamViewers };
  }

  removeStreamViewers(participantSid: string): void {
    const { [participantSid]: _, ...rest } = this.streamViewers;
    this.streamViewers = rest;
  }

  reset(): void {
    for (const id of this.rafIds.values()) cancelAnimationFrame(id);
    for (const timer of this.rafCancelTimers.values()) clearTimeout(timer);
    for (const timer of this.reannounceTimers.values()) clearTimeout(timer);
    this.rafIds.clear();
    this.rafCancelTimers.clear();
    this.reannounceTimers.clear();
    this.attachedTracks.clear();
    this.videoCards = [];
    this.availableStreams = [];
    this.subscribedSids = new Set();
    this.streamViewers = {};
    this.hasAudioTrack = {};
    this.focusedSid = null;
  }
}

export const streamsStore = new StreamsStore();
