export const COOKIES = {
  SESSION: "share_session",
  OAUTH_STATE: "share_oauth_state",
  OAUTH_STATE_TTL_SEC: 300,
} as const;

export const DISCORD = {
  API_BASE: "https://discord.com/api/v10",
  CDN_BASE: "https://cdn.discordapp.com",
  OAUTH_AUTHORIZE: "https://discord.com/oauth2/authorize",
  OAUTH_TOKEN: "https://discord.com/api/oauth2/token",
  OAUTH_REVOKE: "https://discord.com/api/oauth2/token/revoke",
  SCOPES: "identify",
  FETCH_TIMEOUT_MS: 10_000,
  REFRESH_LEEWAY_MS: 60_000,
} as const;

export const SSE = {
  KEEPALIVE_MS: 25_000,
  RETRY_MS: 10_000,
} as const;

export const RATE_LIMIT = {
  GLOBAL: { max: 300, timeWindow: "1 minute" },
  AUTH: { max: 10, timeWindow: "1 minute" },
  TOKEN: { max: 20, timeWindow: "1 minute" },
  WEBHOOK: { max: 100, timeWindow: "1 minute" },
} as const;

export const SESSION = {
  SNAPSHOT_FILE: "session-registry.json",
  TOKEN_BYTES: 32,
  COOKIE_MAX_BYTES: 4096,
  PROFILE_RESYNC_MS: 5 * 60_000,
} as const;

export const OAUTH = {
  DEEPLINK_PATH_MAX: 200,
  NONCE_BYTES: 16,
} as const;

export const LIVEKIT = {
  ROOM_NAME_MAX: 128,
  IDENTITY_PREFIX: "user-",
  IDENTITY_HASH_LENGTH: 16,
  WEBHOOK_CONTENT_TYPE: "application/webhook+json",
} as const;

export const PRESENCE = {
  // Webhook é gatilho, não verdade: cada evento de sala agenda um syncRoom
  // debounced via listParticipants — rajadas viram um snapshot autoritativo.
  SYNC_DEBOUNCE_MS: 500,
} as const;

export const PUBLIC_PATHS = [
  "/api/status",
  "/api/auth/discord/login",
  "/api/auth/discord/callback",
] as const;
