import type { z } from "zod";
import type {
  occupantSchema,
  appStateSchema,
  roomConfigSchema,
  roomPresenceSchema,
  sseEventSchema,
  tokenResponseSchema,
} from "./schemas.js";

export type RoomConfig = z.infer<typeof roomConfigSchema>;
export type Occupant = z.infer<typeof occupantSchema>;
export type RoomPresence = z.infer<typeof roomPresenceSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type SseEvent = z.infer<typeof sseEventSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export interface SessionPayload {
  sub: string;
  name: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  discordExpiresAt: number;
  jti: string;
  iat: number;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface AuthorizeSuccess {
  ok: true;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface AuthorizeDenied {
  ok: false;
  reason: "not_authorized" | "unavailable";
}

export type AuthorizeResult = AuthorizeSuccess | AuthorizeDenied;
