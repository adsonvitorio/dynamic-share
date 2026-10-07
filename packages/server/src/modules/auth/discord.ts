import {
  discordRefreshResponseSchema,
  discordTokenResponseSchema,
  discordUserSchema,
} from "@share/shared";
import { DISCORD } from "../../core/config/constants.js";
import type { AppConfig } from "../../core/config/app.js";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export class DiscordApiError extends Error {
  constructor(
    public readonly status: number,
    endpoint: string,
  ) {
    super(`discord api ${endpoint} respondeu ${status}`);
    this.name = "DiscordApiError";
  }
}

async function postToken(
  config: AppConfig,
  params: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams({
    client_id: config.discordClientId,
    client_secret: config.discordClientSecret,
    ...params,
  });
  return fetch(DISCORD.OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(DISCORD.FETCH_TIMEOUT_MS),
  });
}

export class DiscordClient {
  async exchangeCode(config: AppConfig, code: string): Promise<TokenData> {
    const res = await postToken(config, {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.discordRedirectUri,
    });
    if (!res.ok) throw new DiscordApiError(res.status, "token");
    const parsed = discordTokenResponseSchema.parse(await res.json());
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresIn: parsed.expires_in,
    };
  }

  async refresh(config: AppConfig, refreshToken: string): Promise<TokenData | null> {
    const res = await postToken(config, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (res.status === 400 || res.status === 401) return null;
    if (!res.ok) throw new DiscordApiError(res.status, "token/refresh");
    const parsed = discordRefreshResponseSchema.parse(await res.json());
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresIn: parsed.expires_in,
    };
  }

  async fetchUser(accessToken: string): Promise<DiscordUser> {
    const res = await fetch(`${DISCORD.API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(DISCORD.FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new DiscordApiError(res.status, "users/@me");
    const parsed = discordUserSchema.parse(await res.json());
    return {
      id: parsed.id,
      username: parsed.username,
      globalName: parsed.global_name ?? null,
      avatar: parsed.avatar ?? null,
    };
  }
}
