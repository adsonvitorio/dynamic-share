import { describe, expect, it } from "vitest";
import { SessionCrypto } from "../src/modules/auth/crypto.js";
import type { SessionPayload } from "@share/shared";

const SECRET = "ab".repeat(32);
const OTHER_SECRET = "cd".repeat(32);
const crypto = new SessionCrypto(SECRET);

const payload: SessionPayload = {
  sub: "123456789012345678",
  name: "Test User",
  avatarUrl: "https://cdn.discordapp.com/a.png",
  accessToken: "at-123",
  refreshToken: "rt-456",
  discordExpiresAt: 1_800_000_000_000,
  jti: "jti-abc",
  iat: 1_700_000_000_000,
};

describe("SessionCrypto.seal/open", () => {
  it("round-trip devolve o payload idêntico", () => {
    const sealed = crypto.seal(payload);
    expect(crypto.open(sealed)).toEqual(payload);
  });

  it("cookie adulterado retorna null", () => {
    const sealed = crypto.seal(payload);
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    expect(crypto.open(tampered)).toBeNull();
  });

  it("formato inválido retorna null", () => {
    expect(crypto.open("nao-tem-partes")).toBeNull();
    expect(crypto.open("a.b")).toBeNull();
    expect(crypto.open("a.b.c.d")).toBeNull();
    expect(crypto.open("")).toBeNull();
    expect(crypto.open("!!!.@@@.###")).toBeNull();
  });

  it("chave errada retorna null", () => {
    const sealed = crypto.seal(payload);
    expect(new SessionCrypto(OTHER_SECRET).open(sealed)).toBeNull();
  });

  it("payload fora do schema retorna null", () => {
    const evil = crypto.seal({ ...payload, sub: 42 } as unknown as SessionPayload);
    expect(crypto.open(evil)).toBeNull();
  });

  it("segredo fora de 64-hex falha no construtor", () => {
    expect(() => new SessionCrypto("curto")).toThrow();
  });
});

describe("SessionCrypto.signState/verifyState", () => {
  const state = { nonce: "n".repeat(24), path: "/geral", iat: 1_000_000 };

  it("state válido retorna os dados", () => {
    const signed = crypto.signState(state);
    expect(crypto.verifyState(signed, 300, 1_000_000 + 1000)).toEqual(state);
  });

  it("state adulterado retorna null", () => {
    const signed = crypto.signState(state);
    const dot = signed.lastIndexOf(".");
    const tampered = `${signed.slice(0, dot)}x${signed.slice(dot)}`;
    expect(crypto.verifyState(tampered, 300, 1_000_000 + 1000)).toBeNull();
  });

  it("state expirado retorna null", () => {
    const signed = crypto.signState(state);
    expect(crypto.verifyState(signed, 300, 1_000_000 + 301_000)).toBeNull();
  });

  it("state sem assinatura retorna null", () => {
    expect(crypto.verifyState("sem-ponto", 300, 1_000_000)).toBeNull();
    expect(crypto.verifyState(".apenassinatura", 300, 1_000_000)).toBeNull();
  });

  it("iat no futuro além da margem retorna null", () => {
    const signed = crypto.signState(state);
    expect(crypto.verifyState(signed, 300, 1_000_000 - 61_000)).toBeNull();
  });
});
