import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
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

const dataDir = mkdtempSync(path.join(tmpdir(), "authroutes-"));

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

async function makeApp(overrides?: {
  authorize?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
}) {
  const config = buildAppConfig(env);
  const crypto = new SessionCrypto(env.SESSION_SECRET);
  const registry = SessionRegistry.memory();
  const events = new SessionEvents();
  const discord = {
    exchangeCode: vi.fn().mockResolvedValue(tokens),
    fetchUser: vi.fn().mockResolvedValue(discordUser),
    refresh: overrides?.refresh ?? vi.fn().mockResolvedValue(tokens),
  } as unknown as DiscordClient;
  const authorizer: Authorizer = {
    id: "bot",
    authorize:
      overrides?.authorize ??
      vi.fn().mockResolvedValue({ ok: true, displayName: null, avatarUrl: null }),
  };
  const auth = new AuthService({
    crypto,
    registry,
    events,
    discord,
    authorizer,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
  });
  const livekit = {
    ensureRoom: vi.fn().mockResolvedValue([]),
    listParticipants: vi.fn().mockResolvedValue([]),
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
  return { app, crypto, registry, events, discord, authorizer, presence };
}

async function loginViaHttp(app: Awaited<ReturnType<typeof makeApp>>["app"]) {
  const login = await app.inject({
    method: "GET",
    url: "/api/auth/discord/login?path=/rooms",
  });
  const stateCookie = login.cookies.find((c) => c.name === "share_oauth_state");
  const nonce = new URL(login.headers.location as string).searchParams.get("state");
  const cb = await app.inject({
    method: "GET",
    url: `/api/auth/discord/callback?code=code&state=${nonce}`,
    headers: { cookie: `share_oauth_state=${stateCookie?.value}` },
  });
  const session = cb.cookies.find((c) => c.name === "share_session");
  return { login, cb, sessionCookie: session?.value as string };
}

describe("auth routes", () => {
  it("/api/auth/me sem cookie → 401 session_expired", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("session_expired");
    await app.close();
  });

  it("login → 302 para Discord com state cookie HttpOnly", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/discord/login?path=/rooms" });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("discord.com/oauth2/authorize");
    const state = res.cookies.find((c) => c.name === "share_oauth_state");
    expect(state).toBeDefined();
    expect(state?.httpOnly).toBe(true);
    await app.close();
  });

  it("callback com error → 302 ?reason=oauth_denied", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/discord/callback?error=access_denied",
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("reason=oauth_denied");
    await app.close();
  });

  it("fluxo completo: callback → cookie de sessão → /me retorna perfil", async () => {
    const { app } = await makeApp();
    const { cb, sessionCookie } = await loginViaHttp(app);
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe("http://localhost:5173/rooms");
    expect(sessionCookie).toBeTruthy();
    const session = cb.cookies.find((c) => c.name === "share_session");
    expect(session?.httpOnly).toBe(true);
    expect(String(session?.sameSite).toLowerCase()).toBe("lax");
    expect(session?.path).toBe("/");

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `share_session=${sessionCookie}` },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.name).toBe("Nome");
    await app.close();
  });

  it("callback com state inválido → 302 invalid_state", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/discord/callback?code=c&state=x",
      headers: { cookie: "share_oauth_state=lixo" },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("reason=invalid_state");
    await app.close();
  });

  it("autorização negada → 302 not_authorized sem cookie de sessão", async () => {
    const { app } = await makeApp({
      authorize: vi.fn().mockResolvedValue({ ok: false, reason: "not_authorized" }),
    });
    const login = await app.inject({ method: "GET", url: "/api/auth/discord/login" });
    const stateCookie = login.cookies.find((c) => c.name === "share_oauth_state");
    const nonce = new URL(login.headers.location as string).searchParams.get("state");
    const cb = await app.inject({
      method: "GET",
      url: `/api/auth/discord/callback?code=c&state=${nonce}`,
      headers: { cookie: `share_oauth_state=${stateCookie?.value}` },
    });
    expect(cb.headers.location).toContain("reason=not_authorized");
    expect(cb.cookies.find((c) => c.name === "share_session")).toBeUndefined();
    await app.close();
  });

  it("segundo login → cookie antigo recebe 401 session_replaced", async () => {
    const { app } = await makeApp();
    const first = await loginViaHttp(app);
    await loginViaHttp(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `share_session=${first.sessionCookie}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("session_replaced");
    await app.close();
  });

  it("logout limpa cookie e invalida a sessão", async () => {
    const { app } = await makeApp();
    const { sessionCookie } = await loginViaHttp(app);
    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: `share_session=${sessionCookie}` },
    });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `share_session=${sessionCookie}` },
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("app pausada → 503 paused antes da sessão", async () => {
    const { app } = await makeApp();
    mkdirSync(path.join(dataDir, "state"), { recursive: true });
    writeFileSync(path.join(dataDir, "state", "state.json"), JSON.stringify({ paused: true }));
    const res = await app.inject({ method: "GET", url: "/api/rooms" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("paused");
    const config = await app.inject({ method: "GET", url: "/api/status" });
    expect(config.json().paused).toBe(true);
    writeFileSync(path.join(dataDir, "state", "state.json"), JSON.stringify({ paused: false }));
    await app.close();
  });

  it("refresh em leeway re-emite cookie via onSend", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ accessToken: "at2", refreshToken: "rt2", expiresIn: 604800 });
    const { app, crypto } = await makeApp({ refresh });
    const { sessionCookie } = await loginViaHttp(app);
    const payload = crypto.open(sessionCookie);
    const expiring = crypto.seal({ ...payload!, discordExpiresAt: Date.now() + 30_000 });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `share_session=${expiring}` },
    });
    expect(res.statusCode).toBe(200);
    const renewed = res.cookies.find((c) => c.name === "share_session");
    expect(renewed).toBeDefined();
    expect(crypto.open(renewed!.value)?.accessToken).toBe("at2");
    await app.close();
  });

  it("/api/events e /api/rooms sem cookie → 401", async () => {
    const { app } = await makeApp();
    for (const url of ["/api/events", "/api/rooms"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("session_expired");
    }
    await app.close();
  });

  it("/api/events abre stream SSE com retry frame", async () => {
    const { app, events, presence } = await makeApp();
    const syncAll = vi.spyOn(presence, "syncAll");
    const { sessionCookie } = await loginViaHttp(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
      headers: { cookie: `share_session=${sessionCookie}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("retry: 10000");
    expect(events.streamCount()).toBe(1);
    // Subscribe SSE é gatilho de heal: agenda sync das salas.
    expect(syncAll).toHaveBeenCalled();
    await reader.cancel();
    await app.close();
  });
});
