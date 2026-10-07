import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("$lib/api/client", () => ({ api: { get: getMock } }));

type SseHandler = (data: {
  type: string;
  room?: string;
  live?: boolean;
  participantCount?: number;
  occupants?: { id: string; name: string; avatarUrl: string | null }[];
}) => void;
const sseHandlers = new Map<string, SseHandler>();
const openHandlers: (() => void)[] = [];
const authMock = {
  onSseEvent: vi.fn((type: string, fn: SseHandler) => {
    sseHandlers.set(type, fn);
    return vi.fn();
  }),
  onSseOpen: vi.fn((fn: () => void) => {
    openHandlers.push(fn);
    return vi.fn();
  }),
  markSessionReplaced: vi.fn(),
  checkAuth: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
};
vi.mock("$lib/auth/auth.svelte", () => ({ auth: authMock }));

const ROOMS = {
  rooms: [
    { name: "sala-a", displayName: "Sala A", live: false, participantCount: 0, occupants: [] },
    { name: "sala-b", displayName: "Sala B", live: true, participantCount: 3, occupants: [] },
  ],
};

async function loadStore() {
  vi.resetModules();
  const mod = await import("./rooms.svelte");
  return mod.roomsStore;
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.clear();
  openHandlers.length = 0;
});

describe("load", () => {
  it("carrega salas com live/participantCount e assina rooms_updated", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    expect(store.rooms).toEqual(ROOMS.rooms);
    expect(store.loading).toBe(false);
    expect(authMock.onSseEvent).toHaveBeenCalledWith("rooms_updated", expect.any(Function));
  });

  it("single-flight: loads concorrentes dividem a request", async () => {
    let release: (v: unknown) => void;
    getMock.mockReturnValue(new Promise((r) => (release = r)));
    const store = await loadStore();
    const p1 = store.load();
    const p2 = store.load();
    release!({ ok: true, data: ROOMS });
    await Promise.all([p1, p2]);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("session_replaced → markSessionReplaced", async () => {
    getMock.mockResolvedValue({ ok: false, error: { error: "session_replaced", message: "x" } });
    const store = await loadStore();
    await store.load();
    expect(authMock.markSessionReplaced).toHaveBeenCalled();
    expect(store.error).toBe("");
  });

  it("session_expired → checkAuth (layout redireciona)", async () => {
    getMock.mockResolvedValue({ ok: false, error: { error: "session_expired", message: "x" } });
    const store = await loadStore();
    await store.load();
    expect(authMock.checkAuth).toHaveBeenCalled();
  });

  it("outro erro → mensagem exposta", async () => {
    getMock.mockResolvedValue({ ok: false, error: { error: "unavailable", message: "Sem servidor" } });
    const store = await loadStore();
    await store.load();
    expect(store.error).toBe("Sem servidor");
  });
});

describe("rooms_updated", () => {
  it("atualiza só o card do room, sem refetch", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    getMock.mockClear();
    sseHandlers.get("rooms_updated")!({
      type: "rooms_updated",
      room: "sala-a",
      live: true,
      participantCount: 5,
    });
    expect(store.rooms[0]).toMatchObject({ name: "sala-a", live: true, participantCount: 5 });
    expect(store.rooms[1]).toMatchObject({ name: "sala-b", live: true, participantCount: 3 });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("mescla occupants do evento no card", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    sseHandlers.get("rooms_updated")!({
      type: "rooms_updated",
      room: "sala-b",
      live: true,
      participantCount: 4,
      occupants: [{ id: "u1", name: "Ana", avatarUrl: "https://cdn.discordapp.com/a.png" }],
    });
    expect(store.rooms[1].occupants).toEqual([
      { id: "u1", name: "Ana", avatarUrl: "https://cdn.discordapp.com/a.png" },
    ]);
    expect(store.rooms[0].occupants).toEqual([]);
  });

  it("room desconhecido no evento é ignorado", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    sseHandlers.get("rooms_updated")!({
      type: "rooms_updated",
      room: "fantasma",
      live: true,
      participantCount: 9,
    });
    expect(store.rooms).toEqual(ROOMS.rooms);
  });

  it("destroy cancela a subscription", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    const unsub = authMock.onSseEvent.mock.results[0]!.value as ReturnType<typeof vi.fn>;
    store.destroy();
    expect(unsub).toHaveBeenCalled();
  });
});

describe("sse reaberto", () => {
  it("resync em background refaz o fetch sem mexer em loading", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    expect(store.loading).toBe(false);
    getMock.mockResolvedValue({
      ok: true,
      data: { rooms: ROOMS.rooms.map((r) => ({ ...r, live: true })) },
    });
    for (const fn of openHandlers) fn();
    expect(store.loading).toBe(false);
    await vi.waitFor(() => expect(store.rooms[0]!.live).toBe(true));
    expect(store.rooms[1]!.live).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("resync com load em curso divide a request (single-flight)", async () => {
    let release: (v: unknown) => void;
    getMock.mockReturnValue(new Promise((r) => (release = r)));
    const store = await loadStore();
    const p = store.load();
    for (const fn of openHandlers) fn();
    release!({ ok: true, data: ROOMS });
    await p;
    await Promise.resolve();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("destroy cancela também a subscription de open", async () => {
    getMock.mockResolvedValue({ ok: true, data: ROOMS });
    const store = await loadStore();
    await store.load();
    const unsub = authMock.onSseOpen.mock.results[0]!.value as ReturnType<typeof vi.fn>;
    store.destroy();
    expect(unsub).toHaveBeenCalled();
  });
});
