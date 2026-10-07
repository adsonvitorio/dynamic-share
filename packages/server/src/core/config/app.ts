import path from "node:path";
import { ROOT_DIR, type AppEnv } from "./env.js";

export interface AppConfig {
  viewerUrl: string;
  discordRedirectUri: string;
  publicLivekitUrl: string;
  discordClientId: string;
  discordClientSecret: string;
  allowlistFilePath: string;
  roomsFilePath: string;
  livekitTokenTtlSec: number;
}

function resolveFile(p: string | undefined, fallback: string): string {
  const chosen = p ?? fallback;
  return path.isAbsolute(chosen) ? chosen : path.join(ROOT_DIR, chosen);
}

export function buildAppConfig(env: AppEnv): AppConfig {
  const scheme = env.PRODUCTION ? "https" : "http";
  const wsScheme = env.PRODUCTION ? "wss" : "ws";

  const viewerUrl = env.PRODUCTION
    ? `${scheme}://${env.DOMAIN}`
    : `${scheme}://${env.DOMAIN}:${env.DEV_VIEWER_PORT}`;
  const publicLivekitUrl = env.PRODUCTION
    ? `${wsScheme}://${env.DOMAIN}`
    : `${wsScheme}://localhost:${env.LIVEKIT_DEV_PORT}`;

  return {
    viewerUrl,
    publicLivekitUrl,
    discordRedirectUri: `${viewerUrl}/api/auth/discord/callback`,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    allowlistFilePath: resolveFile(env.ALLOWLIST_FILE, "config/allowlist/allowlist.json"),
    roomsFilePath: resolveFile(env.ROOMS_FILE, "config/rooms/rooms.json"),
    livekitTokenTtlSec: env.LIVEKIT_TOKEN_TTL_SEC,
  };
}
