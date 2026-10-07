import { describe, expect, it } from "vitest";
import { buildAppConfig } from "../src/core/config/app.js";
import { envSchema } from "../src/core/config/env.js";

const rawEnv = {
  PRODUCTION: "false",
  HOST: "0.0.0.0",
  PORT: "8080",
  LOG_LEVEL: "info",
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
};

const devEnv = envSchema.parse(rawEnv);

const prodEnv = envSchema.parse({ ...rawEnv, PRODUCTION: "true" });

describe("buildAppConfig", () => {
  it("deriva urls de dev (http + porta do viewer, ws local)", () => {
    const config = buildAppConfig(devEnv);
    expect(config.viewerUrl).toBe("http://localhost:5173");
    expect(config.discordRedirectUri).toBe(
      "http://localhost:5173/api/auth/discord/callback",
    );
    expect(config.publicLivekitUrl).toBe("ws://localhost:7880");
  });

  it("deriva urls de produção sem porta (https/wss no domínio)", () => {
    const config = buildAppConfig(prodEnv);
    expect(config.viewerUrl).toBe("https://localhost");
    expect(config.discordRedirectUri).toBe(
      "https://localhost/api/auth/discord/callback",
    );
    expect(config.publicLivekitUrl).toBe("wss://localhost");
  });

  it("carrega credenciais e TTL do env", () => {
    const config = buildAppConfig(devEnv);
    expect(config.discordClientId).toBe("id");
    expect(config.discordClientSecret).toBe("secret");
    expect(config.livekitTokenTtlSec).toBe(86400);
  });

  it("resolve paths relativos contra a raiz do repo", () => {
    const config = buildAppConfig(devEnv);
    expect(config.roomsFilePath.replaceAll("\\", "/")).toContain("config/rooms/rooms.json");
    expect(config.allowlistFilePath.replaceAll("\\", "/")).toContain("config/allowlist/allowlist.json");
  });

  it("ROOMS_FILE/ALLOWLIST_FILE customizados prevalecem", () => {
    const env = envSchema.parse({
      ...rawEnv,
      ROOMS_FILE: "/tmp/r.json",
      ALLOWLIST_FILE: "/tmp/a.json",
    });
    const config = buildAppConfig(env);
    expect(config.roomsFilePath).toBe("/tmp/r.json");
    expect(config.allowlistFilePath).toBe("/tmp/a.json");
  });
});
