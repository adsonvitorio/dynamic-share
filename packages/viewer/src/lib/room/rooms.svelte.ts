import { ErrorCodes, type RoomPresence } from "@share/shared";
import { api } from "$lib/api/client";
import { auth } from "$lib/auth/auth.svelte";
import { API } from "$lib/constants";

class RoomsStore {
  rooms = $state<RoomPresence[]>([]);
  loading = $state(true);
  error = $state("");

  private loadPromise: Promise<void> | null = null;
  private unsubscribeSse: (() => void) | null = null;
  private unsubscribeOpen: (() => void) | null = null;

  load(): Promise<void> {
    this.loadPromise ??= this.doLoad(false).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private resync(): void {
    this.loadPromise ??= this.doLoad(true).finally(() => {
      this.loadPromise = null;
    });
  }

  private async doLoad(background: boolean): Promise<void> {
    if (!background) this.loading = true;
    this.error = "";
    this.subscribeSse();
    const res = await api.get<{ rooms: RoomPresence[] }>(API.ROOMS);
    if (res.ok) {
      this.rooms = res.data.rooms;
    } else if (res.error.error === ErrorCodes.SESSION_REPLACED) {
      auth.markSessionReplaced();
    } else if (res.error.error === "session_expired") {
      await auth.checkAuth();
    } else {
      this.error = res.error.message;
    }
    if (!background) this.loading = false;
  }

  private subscribeSse(): void {
    this.unsubscribeSse ??= auth.onSseEvent("rooms_updated", (data) => {
      if (data.type !== "rooms_updated") return;
      this.rooms = this.rooms.map((room) =>
        room.name === data.room
          ? {
              ...room,
              live: data.live,
              participantCount: data.participantCount,
              occupants: data.occupants,
            }
          : room,
      );
    });
    this.unsubscribeOpen ??= auth.onSseOpen(() => this.resync());
  }

  destroy(): void {
    this.unsubscribeSse?.();
    this.unsubscribeSse = null;
    this.unsubscribeOpen?.();
    this.unsubscribeOpen = null;
  }
}

export const roomsStore = new RoomsStore();
