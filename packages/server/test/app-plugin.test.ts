import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { envSchema } from "../src/core/config/env.js";
import { buildAppConfig } from "../src/core/config/app.js";
import { appErrorHandler } from "../src/core/http/error-handler.js";
import appPlugin, {
  AppState,
} from "../src/modules/app/plugin.js";

const env = envSchema.parse({
  PRODUCTION: "false",
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "error",
  SESSION_SECRET: "a".repeat(64),
  SESSION_MAX_DURATION_DAYS: "30",
  DATA_DIR: "./data",
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

const config = buildAppConfig(env);

async function makeApp(stateDir?: string) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(appErrorHandler);
  await app.register(appPlugin, {
    config: config,
    stateDir: stateDir ?? mkdtempSync(path.join(tmpdir(), "pstate-")),
  });
  app.get("/api/ping", () => ({ url: app.appConfig.viewerUrl }));
  return app;
}

describe("config plugin", () => {
  it("expõe a config única em app.appConfig", async () => {
    const app = await makeApp();
    const res = await app.inject({ url: "/api/ping" });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe("http://localhost:5173");
  });
});

describe("AppState.isPaused", () => {
  function stateDirWith(content: string | null): string {
    const dir = mkdtempSync(path.join(tmpdir(), "pstate-"));
    if (content !== null) {
      writeFileSync(path.join(dir, "state.json"), content);
    }
    return dir;
  }

  it("arquivo {paused:true} → pausado", async () => {
    const dir = stateDirWith(JSON.stringify({ paused: true }));
    const state = new AppState(dir);
    expect(await state.isPaused()).toBe(true);
  });

  it("arquivo ausente → não pausado (fail-open)", async () => {
    const dir = stateDirWith(null);
    const state = new AppState(dir);
    expect(await state.isPaused()).toBe(false);
  });

  it("JSON inválido → não pausado + não lança", async () => {
    const dir = stateDirWith('{"paused":"yes"}');
    const state = new AppState(dir);
    expect(await state.isPaused()).toBe(false);
  });

  it("hot reload: mudança no arquivo reflete na próxima leitura", async () => {
    const dir = stateDirWith(JSON.stringify({ paused: false }));
    const state = new AppState(dir);
    expect(await state.isPaused()).toBe(false);
    await new Promise((r) => setTimeout(r, 20)); // mtime granularity
    writeFileSync(path.join(dir, "state.json"), JSON.stringify({ paused: true }));
    expect(await state.isPaused()).toBe(true);
  });
});
