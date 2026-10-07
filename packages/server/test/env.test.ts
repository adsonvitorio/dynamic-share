import { describe, expect, it } from "vitest";
import { envSchema } from "../src/core/config/env.js";

const baseEnv = {
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

describe("envSchema", () => {
  it("aceita config dev válida", () => {
    const res = envSchema.safeParse(baseEnv);
    expect(res.success).toBe(true);
  });

  it("falha sem DOMAIN", () => {
    const env = { ...baseEnv };
    delete (env as Record<string, unknown>).DOMAIN;
    const res = envSchema.safeParse(env);
    expect(res.success).toBe(false);
  });

  it("falha sem credenciais Discord", () => {
    const env = { ...baseEnv };
    delete (env as Record<string, unknown>).DISCORD_CLIENT_SECRET;
    expect(envSchema.safeParse(env).success).toBe(false);
  });

  it("exige vars de dev apenas quando PRODUCTION=false", () => {
    const env = { ...baseEnv, PRODUCTION: "true" };
    delete (env as Record<string, unknown>).LIVEKIT_DEV_PORT;
    delete (env as Record<string, unknown>).DEV_VIEWER_PORT;
    delete (env as Record<string, unknown>).LIVEKIT_DEV_BIN;
    expect(envSchema.safeParse(env).success).toBe(true);
  });

  it("LIVEKIT_DEV_BIN é opcional em dev — vazio/ausente resolve undefined", () => {
    const without = { ...baseEnv };
    delete (without as Record<string, unknown>).LIVEKIT_DEV_BIN;
    const a = envSchema.safeParse(without);
    expect(a.success).toBe(true);
    if (a.success) expect(a.data.LIVEKIT_DEV_BIN).toBeUndefined();
    const b = envSchema.safeParse({ ...baseEnv, LIVEKIT_DEV_BIN: "" });
    expect(b.success).toBe(true);
    if (b.success) expect(b.data.LIVEKIT_DEV_BIN).toBeUndefined();
  });

  it("rejeita SESSION_SECRET fora do formato 64-hex", () => {
    const res = envSchema.safeParse({ ...baseEnv, SESSION_SECRET: "curto" });
    expect(res.success).toBe(false);
  });
});
