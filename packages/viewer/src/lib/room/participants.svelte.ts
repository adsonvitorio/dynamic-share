import { auth } from "$lib/auth/auth.svelte";
import { parseAvatarUrl } from "$lib/utils/avatar";
import { sanitizeDisplayName } from "$lib/utils/text";
import { connectionStore } from "./connection.svelte";
import type { RoomParticipant } from "./types";

class ParticipantsStore {
  participantCount = $state(0);
  participants = $state<RoomParticipant[]>([]);

  update(): void {
    const room = connectionStore.room;
    if (!room) return;
    this.participantCount = room.remoteParticipants.size + 1;
    this.participants = [
      {
        sid: room.localParticipant.sid,
        name: connectionStore.userName,
        isLocal: true,
        avatarUrl: auth.user?.avatarUrl ?? null,
      },
      ...[...room.remoteParticipants.values()].map((participant) => ({
        sid: participant.sid,
        name:
          sanitizeDisplayName(participant.name ?? participant.identity) ||
          participant.identity,
        isLocal: false,
        avatarUrl: parseAvatarUrl(participant.metadata),
      })),
    ];
  }

  reset(): void {
    this.participantCount = 0;
    this.participants = [];
  }
}

export const participantsStore = new ParticipantsStore();
