import crypto from "node:crypto";
import { SHARED_LIMITS } from "@share/shared";
import { LIVEKIT } from "../../core/config/constants.js";

export function isValidRoomName(name: string): boolean {
  return name.length > 0 && name.length <= SHARED_LIMITS.ROOM_NAME_MAX_LENGTH && SHARED_LIMITS.ROOM_NAME_REGEX.test(name);
}

export function identityForSub(sub: string): string {
  return `${LIVEKIT.IDENTITY_PREFIX}${crypto
    .createHash("sha256")
    .update(sub)
    .digest("hex")
    .slice(0, LIVEKIT.IDENTITY_HASH_LENGTH)}`;
}
