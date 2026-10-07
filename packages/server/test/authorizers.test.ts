import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AllowlistAuthorizer } from "../src/modules/auth/authorizers/allowlist.js";
import { createAuthorizer } from "../src/modules/auth/authorizers/index.js";
import type { AppConfig } from "../src/core/config/app.js";

const ID = "123456789012345678";
const dir = mkdtempSync(path.join(tmpdir(), "authz-"));
const listPath = path.join(dir, "allow.json");

function bumpMtime(file: string): void {
  const future = new Date(Date.now() + 5_000);
  utimesSync(file, future, future);
}

describe("AllowlistAuthorizer", () => {
  afterEach(() => rmSync(listPath, { force: true }));

  it("id na lista é autorizado com perfil nulo", async () => {
    writeFileSync(listPath, JSON.stringify([ID, "111111111111111111"]));
    const authz = new AllowlistAuthorizer(listPath);
    expect(await authz.authorize(ID)).toEqual({ ok: true, displayName: null, avatarUrl: null });
  });

  it("id fora da lista é not_authorized", async () => {
    writeFileSync(listPath, JSON.stringify(["111111111111111111"]));
    const authz = new AllowlistAuthorizer(listPath);
    expect(await authz.authorize(ID)).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("arquivo ausente nega tudo (fail-closed)", async () => {
    const authz = new AllowlistAuthorizer(path.join(dir, "inexistente.json"));
    expect(await authz.authorize(ID)).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("arquivo com schema inválido nega tudo", async () => {
    writeFileSync(listPath, JSON.stringify({ users: [ID] }));
    const authz = new AllowlistAuthorizer(listPath);
    expect(await authz.authorize(ID)).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("hot reload: remoção do id passa a negar sem restart", async () => {
    writeFileSync(listPath, JSON.stringify([ID]));
    const authz = new AllowlistAuthorizer(listPath);
    expect((await authz.authorize(ID)).ok).toBe(true);
    writeFileSync(listPath, JSON.stringify([]));
    bumpMtime(listPath);
    expect(await authz.authorize(ID)).toEqual({ ok: false, reason: "not_authorized" });
  });
});

describe("createAuthorizer", () => {
  it("retorna o authorizer de allowlist do config", () => {
    const config = { allowlistFilePath: listPath } as AppConfig;
    expect(createAuthorizer(config).id).toBe("allowlist");
  });
});
