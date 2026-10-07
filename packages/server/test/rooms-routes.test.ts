import crypto from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "livekit-server-sdk";
import { buildApp } from "../src/core/http/app.js";
import { envSchema } from "../src/core/config/env.js";
import { buildAppConfig } from "../src/core/config/app.js";
import { RoomsService } from "../src/modules/rooms/service.js";
import { SessionCrypto } from "../src/modules/auth/crypto.js";
import { SessionRegistry } from "../src/modules/auth/session-registry.js";
import { SessionEvents } from "../src/modules/auth/session-events.js";
import type { DiscordClient } from "../src/modules/auth/discord.js";
import { AuthService } from "../src/modules/auth/service.js";
import type { Authorizer } from "../src/modules/auth/authorizers/types.js";
import type { LiveKitService } from "../src/modules/streaming/livekit.js";
import { PresenceService } from "../src/modules/streaming/presence.js";

const dataDir = mkdtempSync(path.join(tmpdir(), "roomsroutes-"));

const env = envSchema.parse({
  PRODUCTION: "false",
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "error",
  SESSION_SECRET: "a".repeat(64),
  SESSION_MAX_DURATION_DAYS: "30",
  DATA_DIR: dataDir,
  DOMAIN: "localhost",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  LIVEKIT_TOKEN_TTL_SEC: "86400",
  LIVEKIT_URL: "ws://localhost:7880",
  LIVEKIT_API_KEY: "devkey",
  LIVEKIT_API_SECRET: "secret",
  ROOM_EMPTY_TIMEOUT_SEC: "10",
  LIVEKIT_DEV_PORT: "7880",
  DEV_VIEWER_PORT: "5173",
  LIVEKIT_DEV_BIN: "/bin/true",
});

const tokens = { accessToken: "at", refreshToken: "rt", expiresIn: 604800 };
const discordUser = { id: "123456789012345678", username: "u", globalName: "Nome", avatar: "abc" };

async function makeApp() {
  const config = buildAppConfig(env);
  const crypto_ = new SessionCrypto(env.SESSION_SECRET);
  const registry = SessionRegistry.memory();
  const events = new SessionEvents();
  const discord = {
    exchangeCode: vi.fn().mockResolvedValue(tokens),
    fetchUser: vi.fn().mockResolvedValue(discordUser),
    refresh: vi.fn().mockResolvedValue(tokens),
  } as unknown as DiscordClient;
  const authorizer: Authorizer = {
    id: "bot",
    authorize: vi.fn().mockResolvedValue({ ok: true, displayName: "Nick", avatarUrl: null }),
  };
  const auth = new AuthService({
    crypto: crypto_,
    registry,
    events,
    discord,
    authorizer,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
  });
  const livekit = {
    ensureRoom: vi.fn().mockResolvedValue([]),
    generateToken: vi.fn().mockResolvedValue("jwt"),
    verifyWebhook: vi.fn(),
  } as unknown as LiveKitService;
  const presence = new PresenceService(events, async () => []);
  const app = await buildApp({
    env,
    config,
    rooms: new RoomsService(config),
    auth,
    events,
    livekit,
    presence,
  });
  return { app, presence };
}

async function sessionCookie(app: Awaited<ReturnType<typeof makeApp>>["app"], host: string) {
  const login = await app.inject({
    method: "GET",
    url: "/api/auth/discord/login?path=/rooms",
    headers: { host },
  });
  const stateCookie = login.cookies.find((c) => c.name === "share_oauth_state");
  const nonce = new URL(login.headers.location as string).searchParams.get("state");
  const cb = await app.inject({
    method: "GET",
    url: `/api/auth/discord/callback?code=code&state=${nonce}`,
    headers: { cookie: `share_oauth_state=${stateCookie?.value}`, host },
  });
  return cb.cookies.find((c) => c.name === "share_session")?.value as string;
}

function evt(
  event: string,
  roomName: string,
  numParticipants?: number,
  name?: string,
  metadata?: string,
  trackSource?: number,
): WebhookEvent {
  return {
    event,
    room: { name: roomName, numParticipants },
    participant: { identity: "user-x", name, metadata },
    track: trackSource !== undefined ? { source: trackSource } : undefined,
  } as unknown as WebhookEvent;
}

describe("GET /api/rooms com presença", () => {
  it("fail-closed: sem eventos, todas as salas vêm live:false count:0", async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/rooms",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const { rooms } = res.json();
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.live).toBe(false);
      expect(room.participantCount).toBe(0);
    }
    await app.close();
  });

  it("reflete live/count após eventos de presença", async () => {
    const { app, presence } = await makeApp();
    presence.handleEvent(evt("participant_joined", "geral", 4));
    presence.handleEvent(evt("track_published", "geral", undefined, undefined, undefined, 3));
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/rooms",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    const { rooms } = res.json();
    const live = rooms.find((r: { name: string }) => r.name === "geral");
    expect(live).toMatchObject({ live: true, participantCount: 4 });
    const idle = rooms.find((r: { name: string }) => r.name === "games");
    expect(idle).toMatchObject({ live: false, participantCount: 0 });
    await app.close();
  });

  it("expõe occupants do evento na resposta", async () => {
    const { app, presence } = await makeApp();
    presence.handleEvent(
      evt(
        "participant_joined",
        "geral",
        1,
        "Ana",
        JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/avatars/1/x.png" }),
      ),
    );
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/rooms",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    const { rooms } = res.json();
    const live = rooms.find((r: { name: string }) => r.name === "geral");
    expect(live.occupants).toEqual([
      {
        id: crypto.createHash("sha256").update("user-x").digest("hex").slice(0, 16),
        name: "Ana",
        avatarUrl: "https://cdn.discordapp.com/avatars/1/x.png",
      },
    ]);
    const idle = rooms.find((r: { name: string }) => r.name === "games");
    expect(idle.occupants).toEqual([]);
    await app.close();
  });

});
