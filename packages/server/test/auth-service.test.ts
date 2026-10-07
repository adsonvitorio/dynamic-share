import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@share/shared";
import { AuthService } from "../src/modules/auth/service.js";
import { SessionCrypto } from "../src/modules/auth/crypto.js";
import type { DiscordClient } from "../src/modules/auth/discord.js";
import { SessionEvents } from "../src/modules/auth/session-events.js";
import { SessionRegistry } from "../src/modules/auth/session-registry.js";
import type { Authorizer } from "../src/modules/auth/authorizers/types.js";
import type { AppConfig } from "../src/core/config/app.js";

const SECRET = "a".repeat(64);
const USER_ID = "123456789012345678";
const dir = mkdtempSync(path.join(tmpdir(), "authsvc-"));

const config = {
  viewerUrl: "http://viewer.test",
  discordClientId: "cid",
  discordClientSecret: "csec",
  discordRedirectUri: "http://viewer.test/api/auth/discord/callback",
} as AppConfig;

const discordUser = { id: USER_ID, username: "user", globalName: "Global Name", avatar: "abc" };
const tokens = { accessToken: "at", refreshToken: "rt", expiresIn: 604800 };

function makeDeps(overrides?: {
  authorize?: ReturnType<typeof vi.fn>;
  exchangeCode?: ReturnType<typeof vi.fn>;
  fetchUser?: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
}) {
  const crypto = new SessionCrypto(SECRET);
  const registry = SessionRegistry.memory();
  const events = new SessionEvents();
  const discord = {
    exchangeCode: overrides?.exchangeCode ?? vi.fn().mockResolvedValue(tokens),
    fetchUser: overrides?.fetchUser ?? vi.fn().mockResolvedValue(discordUser),
    refresh: overrides?.refresh ?? vi.fn().mockResolvedValue(tokens),
  } as unknown as DiscordClient;
  const authorizer: Authorizer = {
    id: "allowlist",
    authorize:
      overrides?.authorize ??
      vi.fn().mockResolvedValue({ ok: true, displayName: null, avatarUrl: null }),
  };
  const onSessionTerminated = vi.fn();
  const service = new AuthService({
    crypto,
    registry,
    events,
    discord,
    authorizer,
    sessionMaxDays: 30,
    onSessionTerminated,
  });
  return { service, crypto, registry, events, discord, authorizer, onSessionTerminated };
}

function openSession(cookie: string): SessionPayload {
  const crypto = new SessionCrypto(SECRET);
  const payload = crypto.open(cookie);
  expect(payload).not.toBeNull();
  return payload as SessionPayload;
}

async function login(deps: ReturnType<typeof makeDeps>, path = "/rooms") {
  const { location, stateCookie } = deps.service.buildLoginRedirect(config, path);
  const nonce = new URL(location).searchParams.get("state") as string;
  return deps.service.handleCallback(config, { code: "c", state: nonce }, stateCookie);
}

describe("buildLoginRedirect", () => {
  it("monta URL OAuth com state=nonce e state cookie assinado", () => {
    const { service, crypto } = makeDeps();
    const { location, stateCookie } = service.buildLoginRedirect(config, "/rooms");
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(config.discordRedirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("identify");
    const state = crypto.verifyState(stateCookie, 300);
    expect(state?.nonce).toBe(url.searchParams.get("state"));
    expect(state?.path).toBe("/rooms");
  });

  it("deeplink externa é ignorada (path vira /rooms)", () => {
    const { service, crypto } = makeDeps();
    for (const bad of ["//evil.com", "https://evil.com", "javascript:x", "a".repeat(300)]) {
      const { stateCookie } = service.buildLoginRedirect(config, bad);
      expect(crypto.verifyState(stateCookie, 300)?.path).toBe("/rooms");
    }
  });
});

describe("handleCallback", () => {
  it("error do Discord → oauth_denied", async () => {
    const { service } = makeDeps();
    const res = await service.handleCallback(config, { error: "access_denied" }, "x");
    expect(res).toEqual({ ok: false, redirect: "http://viewer.test/login?reason=oauth_denied" });
  });

  it("sem code/state → oauth_failed", async () => {
    const { service } = makeDeps();
    expect(await service.handleCallback(config, {}, "x")).toMatchObject({ ok: false });
    const res = await service.handleCallback(config, { code: "c" }, "x");
    expect(res).toMatchObject({ redirect: expect.stringContaining("oauth_failed") });
  });

  it("state cookie inválido → invalid_state", async () => {
    const { service } = makeDeps();
    const res = await service.handleCallback(config, { code: "c", state: "s" }, "lixo");
    expect(res).toMatchObject({ redirect: expect.stringContaining("invalid_state") });
  });

  it("nonce divergente → invalid_state", async () => {
    const { service } = makeDeps();
    const { stateCookie } = service.buildLoginRedirect(config);
    const res = await service.handleCallback(config, { code: "c", state: "nonce-errado" }, stateCookie);
    expect(res).toMatchObject({ redirect: expect.stringContaining("invalid_state") });
  });

  it("exchange falha → oauth_failed", async () => {
    const deps = makeDeps({ exchangeCode: vi.fn().mockRejectedValue(new Error("x")) });
    const res = await login(deps);
    expect(res).toMatchObject({ ok: false, redirect: expect.stringContaining("oauth_failed") });
  });

  it("autorização negada → not_authorized", async () => {
    const deps = makeDeps({ authorize: vi.fn().mockResolvedValue({ ok: false, reason: "not_authorized" }) });
    const res = await login(deps);
    expect(res).toMatchObject({ redirect: expect.stringContaining("not_authorized") });
  });

  it("authorizer indisponível → unavailable", async () => {
    const deps = makeDeps({ authorize: vi.fn().mockResolvedValue({ ok: false, reason: "unavailable" }) });
    const res = await login(deps);
    expect(res).toMatchObject({ redirect: expect.stringContaining("unavailable") });
  });

  it("sucesso → cookie válido, registry e redirect com deeplink", async () => {
    const deps = makeDeps();
    const res = await login(deps, "/sala-x");
    if (!res.ok) throw new Error("login falhou");
    expect(res.redirect).toBe("http://viewer.test/sala-x");
    const payload = openSession(res.cookie);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.name).toBe("Global Name");
    expect(payload.accessToken).toBe("at");
    expect(deps.registry.resolve(USER_ID)).toBe(payload.jti);
  });

  it("segundo login retorna replacedJti e empurra session_replaced para streams antigas", async () => {
    const deps = makeDeps();
    const first = await login(deps);
    if (!first.ok) throw new Error("login 1 falhou");
    const oldJti = openSession(first.cookie).jti;
    const res = {
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
      on: vi.fn(),
      writableEnded: false,
    };
    deps.events.add(oldJti, res as unknown as import("node:http").ServerResponse);

    const second = await login(deps);
    if (!second.ok) throw new Error("login 2 falhou");
    expect(second.replacedJti).toBe(oldJti);
    const frames = res.write.mock.calls.map((c) => String(c[0]));
    expect(frames.some((f) => f.includes("event: session_replaced"))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  it("payload que excede 4KB selado falha o login", async () => {
    const deps = makeDeps({
      authorize: vi
        .fn()
        .mockResolvedValue({ ok: true, displayName: "x".repeat(5000), avatarUrl: null }),
    });
    const res = await login(deps);
    expect(res).toMatchObject({ ok: false, redirect: expect.stringContaining("oauth_failed") });
  });
});

describe("validate", () => {
  it("cookie inválido → expired", async () => {
    const { service } = makeDeps();
    expect(await service.validate("lixo", config)).toEqual({ ok: false, reason: "expired" });
  });

  it("sessão substituída → replaced", async () => {
    const deps = makeDeps();
    const first = await login(deps);
    if (!first.ok) throw new Error("login falhou");
    await login(deps);
    expect(await deps.service.validate(first.cookie, config)).toEqual({ ok: false, reason: "replaced" });
  });

  it("iat além do cap de dias → expired e remove entry", async () => {
    const deps = makeDeps();
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const old = { ...payload, iat: Date.now() - 31 * 86_400_000 };
    const oldCookie = new SessionCrypto(SECRET).seal(old);
    expect(await deps.service.validate(oldCookie, config)).toEqual({ ok: false, reason: "expired" });
    expect(deps.registry.resolve(USER_ID)).toBeNull();
  });

  it("dexp dentro do leeway → refresh e novo cookie", async () => {
    const refresh = vi.fn().mockResolvedValue({ accessToken: "at2", refreshToken: "rt2", expiresIn: 604800 });
    const deps = makeDeps({ refresh });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const expiring = new SessionCrypto(SECRET).seal({ ...payload, discordExpiresAt: Date.now() + 30_000 });
    const out = await deps.service.validate(expiring, config);
    if (!out.ok) throw new Error("validate falhou");
    expect(refresh).toHaveBeenCalledOnce();
    expect(out.newCookie).toBeDefined();
    const renewed = openSession(out.newCookie as string);
    expect(renewed.accessToken).toBe("at2");
    expect(renewed.jti).toBe(payload.jti);
  });

  it("refresh negado (grant revogado) → expired e remove entry", async () => {
    const deps = makeDeps({ refresh: vi.fn().mockResolvedValue(null) });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const expiring = new SessionCrypto(SECRET).seal({ ...payload, discordExpiresAt: Date.now() + 30_000 });
    expect(await deps.service.validate(expiring, config)).toEqual({ ok: false, reason: "expired" });
    expect(deps.registry.resolve(USER_ID)).toBeNull();
  });

  it("resync negado (removido da fonte) → expired", async () => {
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, displayName: null, avatarUrl: null })
      .mockResolvedValue({ ok: false, reason: "not_authorized" });
    const deps = makeDeps({ authorize });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    expect(await deps.service.validate(res.cookie, config)).toEqual({ ok: false, reason: "expired" });
  });

  it("perfil mudou no resync → novo cookie + profile_updated", async () => {
    const fetchUser = vi
      .fn()
      .mockResolvedValueOnce(discordUser)
      .mockResolvedValue({ ...discordUser, globalName: "Novo Nick" });
    const deps = makeDeps({ fetchUser });
    const send = vi.spyOn(deps.events, "send");
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const out = await deps.service.validate(res.cookie, config);
    if (!out.ok) throw new Error("validate falhou");
    expect(out.newCookie).toBeDefined();
    expect(openSession(out.newCookie as string).name).toBe("Novo Nick");
    expect(send).toHaveBeenCalledWith(expect.any(String), {
      type: "profile_updated",
      name: "Novo Nick",
      avatarUrl: "https://cdn.discordapp.com/avatars/123456789012345678/abc.png",
    });
  });

  it("validate com refresh desligado não renova nem re-emite cookie", async () => {
    const refresh = vi.fn().mockResolvedValue(tokens);
    const deps = makeDeps({ refresh });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const expiring = new SessionCrypto(SECRET).seal({
      ...payload,
      discordExpiresAt: Date.now() + 30_000,
    });
    const out = await deps.service.validate(expiring, config, { refresh: false });
    expect(out.ok).toBe(true);
    expect(out.ok && out.newCookie).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refresh concorrente é deduplicado em uma chamada", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ accessToken: "at2", refreshToken: "rt2", expiresIn: 604800 });
    const deps = makeDeps({ refresh });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const expiring = new SessionCrypto(SECRET).seal({
      ...payload,
      discordExpiresAt: Date.now() + 30_000,
    });
    const [a, b] = await Promise.all([
      deps.service.validate(expiring, config),
      deps.service.validate(expiring, config),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a.ok && b.ok).toBe(true);
  });

  it("resync é throttled: segunda validação não chama authorizer", async () => {
    const authorize = vi.fn().mockResolvedValue({ ok: true, displayName: null, avatarUrl: null });
    const deps = makeDeps({ authorize });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    authorize.mockClear();
    await deps.service.validate(res.cookie, config);
    await deps.service.validate(res.cookie, config);
    expect(authorize).toHaveBeenCalledOnce();
  });
});

describe("logout", () => {
  it("remove entry do registry, fecha streams do jti e revoga o sub", async () => {
    const deps = makeDeps();
    const closeJti = vi.spyOn(deps.events, "closeJti");
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    deps.service.logout(payload);
    expect(deps.registry.resolve(USER_ID)).toBeNull();
    expect(closeJti).toHaveBeenCalledWith(payload.jti);
    expect(deps.onSessionTerminated).toHaveBeenCalledWith(USER_ID);
  });
});

describe("revogação LiveKit (onSessionTerminated)", () => {
  it("sessão substituída por novo login revoga o sub", async () => {
    const deps = makeDeps();
    const first = await login(deps);
    if (!first.ok) throw new Error("login 1 falhou");
    await login(deps);
    expect(deps.onSessionTerminated).toHaveBeenCalledWith(USER_ID);
  });

  it("iat além do cap revoga o sub", async () => {
    const deps = makeDeps();
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    deps.onSessionTerminated.mockClear();
    const payload = openSession(res.cookie);
    const oldCookie = new SessionCrypto(SECRET).seal({
      ...payload,
      iat: Date.now() - 31 * 86_400_000,
    });
    await deps.service.validate(oldCookie, config);
    expect(deps.onSessionTerminated).toHaveBeenCalledWith(USER_ID);
  });

  it("refresh negado revoga o sub", async () => {
    const deps = makeDeps({ refresh: vi.fn().mockResolvedValue(null) });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    deps.onSessionTerminated.mockClear();
    const payload = openSession(res.cookie);
    const expiring = new SessionCrypto(SECRET).seal({
      ...payload,
      discordExpiresAt: Date.now() + 30_000,
    });
    await deps.service.validate(expiring, config);
    expect(deps.onSessionTerminated).toHaveBeenCalledWith(USER_ID);
  });

  it("resync negado (saiu da allowlist) revoga o sub", async () => {
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, displayName: null, avatarUrl: null })
      .mockResolvedValue({ ok: false, reason: "not_authorized" });
    const deps = makeDeps({ authorize });
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    deps.onSessionTerminated.mockClear();
    await deps.service.validate(res.cookie, config);
    expect(deps.onSessionTerminated).toHaveBeenCalledWith(USER_ID);
  });
});

describe("sessionRemainingSec", () => {
  it("retorna min(discordExpiresAt, iat+cap) - now em segundos", async () => {
    const deps = makeDeps();
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const remaining = deps.service.sessionRemainingSec(payload);
    // discordExpiresAt = now + 604800s; iat+cap = now + 30d → discord ganha
    expect(remaining).toBeGreaterThan(604700);
    expect(remaining).toBeLessThanOrEqual(604800);
  });

  it("usa o cap de sessão quando o grant do Discord é mais longo", async () => {
    const deps = makeDeps();
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const farFuture = { ...payload, discordExpiresAt: Date.now() + 365 * 86_400_000 };
    const remaining = deps.service.sessionRemainingSec(farFuture);
    // cap = 30d → ~2592000s
    expect(remaining).toBeGreaterThan(2_590_000);
    expect(remaining).toBeLessThanOrEqual(2_592_000);
  });

  it("sessão expirada retorna 0", async () => {
    const deps = makeDeps();
    const res = await login(deps);
    if (!res.ok) throw new Error("login falhou");
    const payload = openSession(res.cookie);
    const expired = { ...payload, discordExpiresAt: Date.now() - 1000 };
    expect(deps.service.sessionRemainingSec(expired)).toBe(0);
  });
});
