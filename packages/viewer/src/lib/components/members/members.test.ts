import { beforeEach, describe, expect, it, vi } from "vitest";
import membersRailSrc from "./MembersRail.svelte?raw";

const storage = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
});

async function freshStore() {
  vi.resetModules();
  const mod = await import("./members.svelte");
  return mod.membersRailStore;
}

beforeEach(() => {
  storage.clear();
});

describe("membersRailStore", () => {
  it("começa expandido sem preferência salva", async () => {
    const store = await freshStore();
    expect(store.collapsed).toBe(false);
  });

  it("toggle colapsa e persiste na sessionStorage da aba", async () => {
    const store = await freshStore();
    store.toggle();
    expect(store.collapsed).toBe(true);
    expect(storage.get("share_members_rail_collapsed")).toBe("1");
  });

  it("nova instância restaura o estado persistido", async () => {
    storage.set("share_members_rail_collapsed", "1");
    const store = await freshStore();
    expect(store.collapsed).toBe(true);
  });

  it("segundo toggle volta ao expandido e grava 0", async () => {
    const store = await freshStore();
    store.toggle();
    store.toggle();
    expect(store.collapsed).toBe(false);
    expect(storage.get("share_members_rail_collapsed")).toBe("0");
  });
});

describe("rail recolhida — stack vertical de avatares (UR-13)", () => {
  it("MembersRail passa vertical para o OccupantStack", () => {
    expect(membersRailSrc).toContain("OccupantStack");
    expect(membersRailSrc).toContain("vertical");
  });
});
