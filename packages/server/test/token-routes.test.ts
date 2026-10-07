import crypto from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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

const dataDir = mkdtempSync(path.join(tmpdir(), "tokenroutes-"));

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
  LIVEKIT_TOKEN_TTL_SEC: "43200",
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

async function makeApp(opts?: { ensureRoom?: ReturnType<typeof vi.fn>; generateToken?: ReturnType<typeof vi.fn>; expiresIn?: number }) {
  const config = buildAppConfig(env);
  const crypto_ = new SessionCrypto(env.SESSION_SECRET);
  const registry = SessionRegistry.memory();
  const events = new SessionEvents();
  const sessionTokens = opts?.expiresIn === undefined ? tokens : { ...tokens, expiresIn: opts.expiresIn };
  const discord = {
    exchangeCode: vi.fn().mockResolvedValue(sessionTokens),
    fetchUser: vi.fn().mockResolvedValue(discordUser),
    refresh: vi.fn().mockResolvedValue(sessionTokens),
  } as unknown as DiscordClient;
  const authorizer: Authorizer = {
    id: "bot",
    authorize: vi.fn().mockResolvedValue({ ok: true, displayName: null, avatarUrl: null }),
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
    ensureRoom: opts?.ensureRoom ?? vi.fn().mockResolvedValue([{ name: "geral", numParticipants: 2, numPublishers: 0 }]),
    listParticipants: vi.fn().mockResolvedValue([]),
    generateToken: opts?.generateToken ?? vi.fn().mockResolvedValue("livekit.jwt"),
    verifyWebhook: vi.fn(),
  } as unknown as LiveKitService;
  const presence = new PresenceService(events, (room) => livekit.listParticipants(room));
  const reconcile = vi.spyOn(presence, "reconcile");
  const syncRoom = vi.spyOn(presence, "syncRoom");
  const app = await buildApp({
    env,
    config,
    rooms: new RoomsService(config),
    auth,
    events,
    livekit,
    presence,
  });
  return { app, crypto: crypto_, livekit, presence, reconcile, syncRoom };
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

const expectedIdentity = `user-${crypto
  .createHash("sha256")
  .update("123456789012345678")
  .digest("hex")
  .slice(0, 16)}`;

describe("GET /api/token", () => {
  it("200 com {token, url} — sala = slug, identity hasheada, ttl=min(sessão, cap)", async () => {
    const { app, livekit, reconcile } = await makeApp();
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBe("livekit.jwt");
    expect(body.url).toBe("ws://localhost:7880");
    expect(livekit.ensureRoom).toHaveBeenCalledWith("geral");
    expect(reconcile).toHaveBeenCalledWith([
      { name: "geral", numParticipants: 2, numPublishers: 0 },
    ]);
    const genCall = vi.mocked(livekit.generateToken).mock.calls[0]![0];
    expect(genCall.room).toBe("geral");
    expect(genCall.identity).toBe(expectedIdentity);
    expect(genCall.name).toBe("Nome");
    expect(JSON.parse(genCall.metadata)).toEqual({
      avatarUrl: "https://cdn.discordapp.com/avatars/123456789012345678/abc.png",
    });
    // ttl = min(sessão restante (~7d - ms decorrido), cap 43200) → cap ganha
    expect(genCall.ttlSec).toBe(43200);
    await app.close();
  });

  it("sincroniza occupants/sharers via listParticipants (fire-and-forget)", async () => {
    const { app, livekit, syncRoom } = await makeApp();
    vi.mocked(livekit.listParticipants).mockResolvedValue([
      { identity: "user-a", name: "Ana", metadata: "", tracks: [{ source: 3 }] },
    ] as never);
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => {
      expect(syncRoom).toHaveBeenCalledWith("geral", [
        expect.objectContaining({ identity: "user-a" }),
      ]);
    });
    await app.close();
  });

  it("falha do listParticipants não quebra o token (loga e segue)", async () => {
    const { app, livekit, syncRoom } = await makeApp();
    vi.mocked(livekit.listParticipants).mockRejectedValue(new Error("twirp down"));
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe("livekit.jwt");
    await new Promise((r) => setTimeout(r, 20));
    expect(syncRoom).not.toHaveBeenCalled();
    await app.close();
  });

  it("ttl é limitado pela sessão restante quando menor que o cap (residual <60s ainda emite)", async () => {
    const { app, livekit } = await makeApp({ expiresIn: 45 });
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const genCall = vi.mocked(livekit.generateToken).mock.calls[0]![0];
    // sessão ~45s < cap 43200 → sessão ganha (floor de ms→s pode dar 44)
    expect(genCall.ttlSec).toBeGreaterThan(0);
    expect(genCall.ttlSec).toBeLessThanOrEqual(45);
    await app.close();
  });

  it("400 invalid_input para slug que falha o schema", async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=INVALID_CAPS",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_input");
    await app.close();
  });

  it("404 invalid_room para slug não configurado", async () => {
    const { app } = await makeApp();
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=nao-existe",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("invalid_room");
    await app.close();
  });

  it("503 unavailable quando ensureRoom falha", async () => {
    const { app } = await makeApp({
      ensureRoom: vi.fn().mockRejectedValue(new Error("livekit down")),
    });
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("unavailable");
    await app.close();
  });

  it("503 unavailable quando generateToken falha", async () => {
    const { app } = await makeApp({
      generateToken: vi.fn().mockRejectedValue(new Error("jwt sign failed")),
    });
    const cookie = await sessionCookie(app, "localhost");
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost", cookie: `share_session=${cookie}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("unavailable");
    await app.close();
  });

  it("401 session_expired sem cookie", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/token?room=geral",
      headers: { host: "localhost" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("session_expired");
    await app.close();
  });

  it("429 rate_limited com mensagem própria ao estourar o limite da rota", async () => {
    const { app } = await makeApp();
    // Sem sessão o request morre no 401 antes do hook de rate-limit da
    // rota — o limite só conta requests que passam pela auth.
    const cookie = await sessionCookie(app, "localhost");
    let last;
    for (let i = 0; i < 21; i++) {
      last = await app.inject({
        method: "GET",
        url: "/api/token?room=geral",
        headers: { host: "localhost", cookie: `share_session=${cookie}` },
      });
    }
    expect(last!.statusCode).toBe(429);
    expect(last!.json().error).toBe("rate_limited");
    expect(last!.json().message).toContain("Muitas requisições");
    await app.close();
  });
});
