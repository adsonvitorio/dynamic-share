import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SignJWT } from "jose";
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
import { LiveKitService } from "../src/modules/streaming/livekit.js";
import { PresenceService } from "../src/modules/streaming/presence.js";

const dataDir = mkdtempSync(path.join(tmpdir(), "webhookroutes-"));

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

async function makeApp() {
  const config = buildAppConfig(env);
  const crypto_ = new SessionCrypto(env.SESSION_SECRET);
  const events = new SessionEvents();
  const auth = new AuthService({
    crypto: crypto_,
    registry: SessionRegistry.memory(),
    events,
    discord: {} as DiscordClient,
    authorizer: { id: "allowlist", authorize: vi.fn() } as Authorizer,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
  });
  const livekit = new LiveKitService(
    env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
    env.ROOM_EMPTY_TIMEOUT_SEC,
  );
  const presence = new PresenceService(events, async () => []);
  const handleEvent = vi.spyOn(presence, "handleEvent");
  const app = await buildApp({
    env,
    config,
    rooms: new RoomsService(config),
    auth,
    events,
    livekit,
    presence,
  });
  return { app, presence, handleEvent };
}

async function signedBody(payload: object, secret = env.LIVEKIT_API_SECRET) {
  const body = JSON.stringify(payload);
  const sha256 = createHash("sha256").update(body).digest("base64");
  const jwt = await new SignJWT({ sha256 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.LIVEKIT_API_KEY)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  return { body, jwt };
}

describe("POST /webhook", () => {
  it("200 com assinatura válida — evento despachado para a presença", async () => {
    const { app, presence, handleEvent } = await makeApp();
    const { body, jwt } = await signedBody({
      event: "participant_joined",
      room: { name: "sala", numParticipants: 3 },
      participant: { identity: "user-abc" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        host: "localhost",
        "content-type": "application/webhook+json",
        authorization: jwt,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(handleEvent).toHaveBeenCalledTimes(1);
    expect(presence.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 3,
      occupants: [],
    });
    await app.close();
  });

  it("401 webhook_invalid com assinatura forjada", async () => {
    const { app } = await makeApp();
    const { body } = await signedBody({ event: "room_started", room: { name: "x" } });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        host: "localhost",
        "content-type": "application/webhook+json",
        authorization: "assinatura-forjada",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("webhook_invalid");
    await app.close();
  });

  it("401 webhook_invalid com body adulterado após assinatura", async () => {
    const { app } = await makeApp();
    const { jwt } = await signedBody({ event: "room_started" });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        host: "localhost",
        "content-type": "application/webhook+json",
        authorization: jwt,
      },
      payload: JSON.stringify({ event: "room_finished", room: { name: "x" } }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("webhook_invalid");
    await app.close();
  });

  it("401 webhook_invalid sem header Authorization", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        host: "localhost",
        "content-type": "application/webhook+json",
      },
      payload: JSON.stringify({ event: "room_started" }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("webhook_invalid");
    await app.close();
  });

  it("401 webhook_invalid com body não-Buffer (json comum)", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { host: "localhost", "content-type": "application/json" },
      payload: JSON.stringify({ event: "room_started" }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("webhook_invalid");
    await app.close();
  });

  it("200 mesmo quando handleEvent falha internamente", async () => {
    const { app, handleEvent } = await makeApp();
    handleEvent.mockImplementation(() => {
      throw new Error("bug interno");
    });
    const { body, jwt } = await signedBody({ event: "room_started", room: { name: "x" } });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        host: "localhost",
        "content-type": "application/webhook+json",
        authorization: jwt,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
