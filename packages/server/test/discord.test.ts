import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordApiError, DiscordClient } from "../src/modules/auth/discord.js";
import type { AppConfig } from "../src/core/config/app.js";

const config = {
  discordClientId: "cid",
  discordClientSecret: "csecret",
  discordRedirectUri: "http://app.example.com/api/auth/discord/callback",
} as AppConfig;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const client = new DiscordClient();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("exchangeCode", () => {
  it("posta grant authorization_code com redirect da app", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 604800 }),
    );
    const data = await client.exchangeCode(config, "code-123");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("oauth2/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
    expect(body.get("redirect_uri")).toBe(config.discordRedirectUri);
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csecret");
    expect(data).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 604800 });
  });

  it("resposta de erro lança DiscordApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "invalid_grant" }));
    await expect(client.exchangeCode(config, "bad")).rejects.toBeInstanceOf(DiscordApiError);
  });
});

describe("refresh", () => {
  it("grant inválido retorna null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "invalid_grant" }));
    expect(await client.refresh(config, "rt-dead")).toBeNull();
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    expect(await client.refresh(config, "rt-dead")).toBeNull();
  });

  it("sucesso retorna novos tokens", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: "at2", refresh_token: "rt2", expires_in: 604800 }),
    );
    const data = await client.refresh(config, "rt1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).get("grant_type")).toBe("refresh_token");
    expect(data?.accessToken).toBe("at2");
    expect(data?.refreshToken).toBe("rt2");
  });

  it("erro de servidor (5xx) lança DiscordApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(client.refresh(config, "rt")).rejects.toBeInstanceOf(DiscordApiError);
  });

  it("erro de rede propaga", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(client.refresh(config, "rt")).rejects.toThrow("fetch failed");
  });
});

describe("fetchUser", () => {
  it("retorna usuário mapeado com bearer", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "123456789012345678", username: "u", global_name: "Nome", avatar: "abc" }),
    );
    const user = await client.fetchUser("at");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/users/@me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at");
    expect(user).toEqual({ id: "123456789012345678", username: "u", globalName: "Nome", avatar: "abc" });
  });

  it("campos nulos caem para null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "123456789012345678", username: "u" }));
    const user = await client.fetchUser("at");
    expect(user.globalName).toBeNull();
    expect(user.avatar).toBeNull();
  });

  it("payload fora do schema lança", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "abc" }));
    await expect(client.fetchUser("at")).rejects.toThrow();
  });
});
