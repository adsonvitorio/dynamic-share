import { Track } from "livekit-client";
import { LIVEKIT } from "$lib/constants";
import {
  attachScreenShareAudio,
  detachScreenShareAudio,
  setAudioMuted,
} from "$lib/utils/audio";
import { publishData } from "$lib/utils/livekit-data";
import { createLogger } from "$lib/utils/logger";
import { playEventSound } from "$lib/utils/notify-sound";
import { parseAvatarUrl } from "$lib/utils/avatar";
import { sanitizeDisplayName } from "$lib/utils/text";
import { notifications } from "./notifications.svelte";
import { connectionStore } from "./connection.svelte";
import { streamsStore } from "./streams.svelte";
import { sharingStore } from "./sharing.svelte";
import { qualityStore } from "./quality.svelte";
import { participantsStore } from "./participants.svelte";
import type { UploadFps, UploadQuality } from "./types";

const log = createLogger("Room");

const UPLOAD_QUALITY_KEYS = new Set<string>(
  LIVEKIT.UPLOAD_QUALITY_OPTIONS.map((o) => o.key),
);
const FPS_KEYS = new Set<string>(LIVEKIT.FPS_OPTIONS.map((o) => o.key));

function announceUploadState(): void {
  publishData(connectionStore.room, {
    type: LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_QUALITY,
    quality: qualityStore.uploadQuality,
  });
  publishData(connectionStore.room, {
    type: LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_FPS,
    fps: qualityStore.uploadFps,
  });
}

// O DataReceived não expõe a identity do transporte quando o pacote chega
// antes do SDK registrar o join (participant undefined) — aceitar a
// `identity` do payload nesse caso permitiria forjar viewers fantasmas.
// A race real ("entrou já assistindo" contava 0) é fechada por dois
// re-anúncios pós-sinalização: onTrackSubscribed (subscription completa
// implica join propagado) e o ping viewership-sync em onParticipantConnected
// (join processado → resposta chega com remetente verificado), mais um
// re-anúncio tardio em announceViewership como margem extra.

// Sids vivos = remotes + local. Rejoin com mesma identity (duplicate em
// outra aba) faz o SDK mutar o sid do objeto do participante in-place —
// eventos da sessão morta chegam com o sid da sessão NOVA e a remoção por
// sid erra o alvo. A varredura por sids vivos fecha a classe inteira.
function liveSids(): Set<string> | null {
  const room = connectionStore.room;
  if (!room) return null;
  const live = new Set<string>([room.localParticipant.sid]);
  for (const p of room.remoteParticipants.values()) live.add(p.sid);
  return live;
}

function pruneDeadSids(): void {
  const live = liveSids();
  if (!live) return;
  streamsStore.pruneDisconnected(live);
  qualityStore.pruneDisconnected(live);
}

export async function connectRoom(roomName: string): Promise<void> {
  connectionStore.setHandlers({
    onTrackPublished: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare && !participant.isLocal) {
        streamsStore.addAvailableStream(participant);
        notifications.notify("share_start", {
          name: sanitizeDisplayName(participant.name ?? participant.identity) || participant.identity,
          avatarUrl: parseAvatarUrl(participant.metadata),
        });
      }
      if (pub.source === Track.Source.ScreenShareAudio) {
        streamsStore.setHasAudio(participant.sid, true);
      }
      participantsStore.update();
    },

    onTrackUnpublished: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare && !participant.isLocal) {
        streamsStore.removeAvailableStream(participant);
        streamsStore.removeStreamViewers(participant.sid);
        notifications.notify("share_stop", {
          name: sanitizeDisplayName(participant.name ?? participant.identity) || participant.identity,
          avatarUrl: parseAvatarUrl(participant.metadata),
        });
      }
      if (pub.source === Track.Source.ScreenShareAudio) {
        streamsStore.removeHasAudio(participant.sid);
      }
      pruneDeadSids();
      participantsStore.update();
    },

    onTrackMuted: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShareAudio && !participant.isLocal) {
        streamsStore.setHasAudio(participant.sid, false);
      }
    },

    onTrackUnmuted: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShareAudio && !participant.isLocal) {
        streamsStore.setHasAudio(participant.sid, true);
        // setMuted(false) do SDK re-attacha o stream no <audio> e força
        // el.muted=false — repõe o mute local do viewer por cima.
        setAudioMuted(
          participant.sid,
          qualityStore.remoteAudioMuted[participant.sid] ?? false,
        );
      }
    },

    onTrackSubscribed: (track, _pub, participant) => {
      if (track.source === Track.Source.ScreenShare) {
        streamsStore.addVideoCard(participant, track, false);
        streamsStore.addSubscribed(participant.sid);
        qualityStore.applyQuality(participant.sid);
        // Re-anúncio pós-sinalização: cobre a race em que o primeiro
        // announce (em toggleSubscribe) chega antes do sharer ver o join.
        streamsStore.announceViewership(participant.sid, true);
      } else if (track.source === Track.Source.ScreenShareAudio) {
        attachScreenShareAudio(participant.sid, track);
      }
      participantsStore.update();
    },

    onTrackUnsubscribed: (track, _pub, participant) => {
      if (track.source === Track.Source.ScreenShare) {
        streamsStore.removeVideoCard(participant);
        streamsStore.removeSubscribed(participant.sid);
        streamsStore.announceViewership(participant.sid, false);
      } else if (track.source === Track.Source.ScreenShareAudio) {
        detachScreenShareAudio(participant.sid);
      }
      pruneDeadSids();
      participantsStore.update();
    },

    onLocalTrackPublished: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare && pub.track) {
        streamsStore.addVideoCard(participant, pub.track, true);
        streamsStore.addAvailableStream(participant, true);
        void playEventSound("shareStart");
        announceUploadState();
      }
      if (pub.source === Track.Source.ScreenShareAudio) {
        streamsStore.setHasAudio(participant.sid, true);
      }
      participantsStore.update();
    },

    onLocalTrackUnpublished: (pub, participant) => {
      if (pub.source === Track.Source.ScreenShare) {
        streamsStore.removeVideoCard(participant);
        streamsStore.removeAvailableStream(participant);
        streamsStore.removeStreamViewers(participant.sid);
        if (participant.isLocal) {
          sharingStore.reset();
          void playEventSound("shareStop");
        }
      }
      if (pub.source === Track.Source.ScreenShareAudio) {
        streamsStore.removeHasAudio(participant.sid);
      }
      participantsStore.update();
    },

    onParticipantConnected: (participant) => {
      participantsStore.update();
      notifications.notify("room_join", {
        name: sanitizeDisplayName(participant.name ?? participant.identity) || participant.identity,
        avatarUrl: parseAvatarUrl(participant.metadata),
      });
      if (sharingStore.isSharing) announceUploadState();
      for (const sid of streamsStore.subscribedSids) {
        streamsStore.announceViewership(sid, true);
      }
      // Ping de sincronia: o joiner pode ter anunciado viewership antes do
      // join propagar (pacote descartado sem remetente verificável). O sync
      // sai só depois do join processado, então a resposta dele chega com
      // participant resolvido — fecha a race sem confiar no payload.
      publishData(connectionStore.room, {
        type: LIVEKIT.DATA_MESSAGE_TYPES.VIEWERSHIP_SYNC,
      });
    },

    onParticipantDisconnected: (participant) => {
      participantsStore.update();
      notifications.notify("room_leave", {
        name: sanitizeDisplayName(participant.name ?? participant.identity) || participant.identity,
        avatarUrl: parseAvatarUrl(participant.metadata),
      });
      streamsStore.removeViewerFromAll(participant.identity);
      streamsStore.removeAvailableStream(participant);
      streamsStore.removeVideoCard(participant);
      streamsStore.removeSubscribed(participant.sid);
      streamsStore.removeHasAudio(participant.sid);
      streamsStore.removeStreamViewers(participant.sid);
      qualityStore.removeRemoteAudio(participant.sid);
      qualityStore.removeRemoteQuality(participant.sid);
      detachScreenShareAudio(participant.sid);
      pruneDeadSids();
    },

    onParticipantMetadataChanged: (participant) => {
      participantsStore.update();
      streamsStore.updateAvailableStream(participant);
      streamsStore.updateViewersAvatar(participant);
    },

    // Kick terminal (duplicate_identity/server shutdown): o SDK não emite
    // LocalTrackUnpublished para tracks derrubadas pelo server — sem o
    // reset o card local e o estado "compartilhando" ficavam congelados.
    onTerminated: () => {
      streamsStore.reset();
      sharingStore.reset();
      participantsStore.reset();
      qualityStore.reset();
      notifications.reset();
    },

    onDataReceived: (payload, participant) => {
      try {
        const msg: unknown = JSON.parse(new TextDecoder().decode(payload));
        if (typeof msg !== "object" || msg === null) return;
        const data = msg as Record<string, unknown>;
        if (typeof data.type !== "string") return;
        // Sem participant o remetente não é verificável — o payload é
        // controlado por qualquer participante, então name/identity dele
        // nunca entram na confiança (spoofing de viewer).
        if (!participant) return;
        if (
          data.type === LIVEKIT.DATA_MESSAGE_TYPES.VIEWERSHIP &&
          typeof data.streamSid === "string" &&
          typeof data.watching === "boolean"
        ) {
          streamsStore.updateViewership(
            participant,
            data.streamSid,
            data.watching,
          );
          return;
        }
        if (data.type === LIVEKIT.DATA_MESSAGE_TYPES.VIEWERSHIP_SYNC) {
          for (const sid of streamsStore.subscribedSids) {
            streamsStore.announceViewership(sid, true);
          }
          return;
        }
        if (
          data.type === LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_QUALITY &&
          typeof data.quality === "string" &&
          UPLOAD_QUALITY_KEYS.has(data.quality)
        ) {
          qualityStore.setRemoteUploadQuality(
            participant.sid,
            data.quality as UploadQuality,
          );
        } else if (
          data.type === LIVEKIT.DATA_MESSAGE_TYPES.UPLOAD_FPS &&
          typeof data.fps === "string" &&
          FPS_KEYS.has(data.fps)
        ) {
          qualityStore.setRemoteUploadFps(participant.sid, data.fps as UploadFps);
        }
      } catch (err) {
        log.warn("data_message_invalid", err);
      }
    },
  });

  await connectionStore.connect(roomName);

  if (connectionStore.room) {
    for (const participant of connectionStore.room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare) {
          streamsStore.addAvailableStream(participant);
        }
        if (pub.source === Track.Source.ScreenShareAudio) {
          streamsStore.setHasAudio(participant.sid, true);
        }
      }
    }
    if (sharingStore.isSharing) announceUploadState();
    participantsStore.update();
  }
}

export async function destroyRoom(): Promise<void> {
  await connectionStore.destroy();
  streamsStore.reset();
  participantsStore.reset();
  qualityStore.reset();
  sharingStore.reset();
  notifications.reset();
}

export {
  connectionStore,
  streamsStore,
  sharingStore,
  qualityStore,
  participantsStore,
};
