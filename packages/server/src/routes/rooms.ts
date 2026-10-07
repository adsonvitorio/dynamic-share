import type { FastifyInstance } from "fastify";
import type { RoomsService } from "../modules/rooms/service.js";
import type { PresenceService } from "../modules/streaming/presence.js";

export function roomRoutes(
  app: FastifyInstance,
  rooms: RoomsService,
  presence: PresenceService,
): void {
  app.get("/api/rooms", async () => {
    const list = await rooms.list();
    const live = presence.snapshot();
    return {
      rooms: list.map((room) => {
        const p = live.get(room.name);
        return {
          ...room,
          live: p?.live ?? false,
          participantCount: p?.participantCount ?? 0,
          occupants: p?.occupants ?? [],
        };
      }),
    };
  });
}
