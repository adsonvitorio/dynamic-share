import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SessionRegistry } from "../src/modules/auth/session-registry.js";

const dir = await mkdtemp(path.join(tmpdir(), "share-registry-"));
const snap = path.join(dir, "session-registry.json");
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("SessionRegistry", () => {
  it("register retorna replacedJti quando havia jti anterior", async () => {
    const r = await SessionRegistry.load(path.join(dir, "a.json"));
    const key = SessionRegistry.key("user1");
    expect(r.register(key, "jti-1")).toEqual({});
    const second = r.register(key, "jti-2");
    expect(second).toEqual({ replacedJti: "jti-1" });
  });

  it("check: jti igual→ok, jti≠com entry→replaced, sem entry→expired", async () => {
    const r = await SessionRegistry.load(path.join(dir, "b.json"));
    const key = SessionRegistry.key("user2");
    r.register(key, "jti-x");
    expect(r.check(key, "jti-x")).toBe("ok");
    expect(r.check(key, "jti-y")).toBe("replaced");
    expect(r.check(SessionRegistry.key("outro"), "jti-x")).toBe("expired");
  });

  it("remove faz o jti voltar para expired", async () => {
    const r = await SessionRegistry.load(path.join(dir, "c.json"));
    const key = SessionRegistry.key("user3");
    r.register(key, "jti-z");
    r.remove(key);
    expect(r.check(key, "jti-z")).toBe("expired");
    expect(r.resolve(key)).toBeNull();
  });

  it("snapshot persiste e carrega de volta", async () => {
    const r = await SessionRegistry.load(snap);
    const key = SessionRegistry.key("user4");
    r.register(key, "jti-persist");
    await r.persist();

    const loaded = await SessionRegistry.load(snap);
    expect(loaded.resolve(key)).toBe("jti-persist");
    expect(loaded.check(key, "jti-persist")).toBe("ok");
  });

  it("snapshot corrompido carrega vazio", async () => {
    const bad = path.join(dir, "bad.json");
    await writeFile(bad, "{nao-e-json", "utf8");
    const r = await SessionRegistry.load(bad);
    expect(r.size).toBe(0);
  });

  it("schema errado no snapshot carrega vazio", async () => {
    const bad = path.join(dir, "bad-schema.json");
    await writeFile(bad, JSON.stringify({ version: 2, entries: {} }), "utf8");
    const r = await SessionRegistry.load(bad);
    expect(r.size).toBe(0);
  });

  it("snapshot ausente carrega vazio sem erro", async () => {
    const r = await SessionRegistry.load(path.join(dir, "nunca-existiu.json"));
    expect(r.size).toBe(0);
  });
});
