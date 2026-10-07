import type { Room } from "livekit-client";
import { createLogger } from "./logger";

const log = createLogger("LiveKitData");

export function publishData(room: Room | null, msg: Record<string, unknown>): void {
  if (!room) return;
  room.localParticipant
    .publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true })
    .catch((err) => log.warn("publish_failed", err));
}
