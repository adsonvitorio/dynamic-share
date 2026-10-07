import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("$lib/api/client", () => ({
  api: { get: getMock, post: vi.fn() },
}));

const { app } = await import("./app.svelte");

beforeEach(() => {
  getMock.mockReset();
  app.status = "loading";
});

describe("app store load()", () => {
  it("paused=false → status ready", async () => {
    getMock.mockResolvedValue({ ok: true, data: { paused: false } });
    await app.load();
    expect(app.status).toBe("ready");
    expect(app.isReady).toBe(true);
  });

  it("paused=true → status paused", async () => {
    getMock.mockResolvedValue({ ok: true, data: { paused: true } });
    await app.load();
    expect(app.status).toBe("paused");
    expect(app.isReady).toBe(false);
  });

  it("erro da API → status error", async () => {
    getMock.mockResolvedValue({
      ok: false,
      error: { error: "network", message: "?" },
    });
    await app.load();
    expect(app.status).toBe("error");
  });

  it("shape inválido (schema) → status error", async () => {
    getMock.mockResolvedValue({ ok: true, data: { paused: "yes" } });
    await app.load();
    expect(app.status).toBe("error");
  });

  it("reload reseta para loading antes do fetch", async () => {
    getMock.mockResolvedValue({ ok: true, data: { paused: false } });
    await app.load();
    app.status = "ready";
    let seen: string | undefined;
    getMock.mockImplementation(async () => {
      seen = app.status;
      return { ok: true, data: { paused: false } };
    });
    await app.load();
    expect(seen).toBe("loading");
  });
});
