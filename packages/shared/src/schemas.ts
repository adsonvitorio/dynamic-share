import { z } from "zod";

export const SHARED_LIMITS = {
  ROOM_NAME_REGEX: /^[a-z0-9-]+$/,
  ROOM_NAME_MAX_LENGTH: 50,
  DISPLAY_NAME_MAX_LENGTH: 32,
  ROOM_MAX_COUNT: 100,
  OCCUPANT_PREVIEW_MAX: 8,
} as const;



export const roomConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(SHARED_LIMITS.ROOM_NAME_MAX_LENGTH)
    .regex(SHARED_LIMITS.ROOM_NAME_REGEX, "room name must be lowercase alphanumeric with dashes"),
  displayName: z.string().min(1).max(SHARED_LIMITS.DISPLAY_NAME_MAX_LENGTH),
  description: z.string().max(200).optional(),
  icon: z.string().max(256).optional(),
});

export const roomsConfigSchema = z
  .array(roomConfigSchema)
  .max(SHARED_LIMITS.ROOM_MAX_COUNT)
  .refine(
    (rooms) => new Set(rooms.map((r) => r.name)).size === rooms.length,
    { message: "room names must be unique" },
  );

export const allowlistSchema = z.array(z.string().regex(/^\d{10,25}$/)).max(10000);

export const appStateSchema = z.object({
  paused: z.boolean(),
});

export const discordTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

export const discordUserSchema = z.object({
  id: z.string().regex(/^\d{10,25}$/),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export const discordRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

export const loginReasonSchema = z.enum([
  "expired",
  "session_replaced",
  "logged_out",
  "not_authorized",
  "unavailable",
  "invalid_state",
  "oauth_denied",
  "oauth_failed",
  "unauthorized",
]);

export const tokenRoomQuerySchema = z.object({
  room: z
    .string()
    .min(1)
    .max(SHARED_LIMITS.ROOM_NAME_MAX_LENGTH)
    .regex(SHARED_LIMITS.ROOM_NAME_REGEX),
});

export const tokenResponseSchema = z.object({
  token: z.string().min(1),
  url: z.string().min(1),
});

export const occupantSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(64),
  avatarUrl: z.string().max(512).nullable(),
  sharing: z.boolean().optional(),
});

export const roomPresenceSchema = roomConfigSchema.extend({
  live: z.boolean(),
  participantCount: z.number().int().min(0),
  occupants: z.array(occupantSchema).max(SHARED_LIMITS.OCCUPANT_PREVIEW_MAX).default([]),
});

export const roomsResponseSchema = z.object({
  rooms: z.array(roomPresenceSchema),
});

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session_replaced") }),
  z.object({ type: z.literal("profile_updated"), name: z.string().max(64), avatarUrl: z.string().max(512).nullable() }),

  z.object({
    type: z.literal("rooms_updated"),
    room: z.string().max(SHARED_LIMITS.ROOM_NAME_MAX_LENGTH),
    live: z.boolean(),
    participantCount: z.number().int().min(0),
    occupants: z.array(occupantSchema).max(SHARED_LIMITS.OCCUPANT_PREVIEW_MAX).default([]),
  }),
]);
