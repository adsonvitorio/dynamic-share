import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("$lib/api/client", () => ({
  api: { get: getMock, post: postMock },
}));

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  private listeners = new Map<string, ((ev: unknown) => void)[]>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  emit(type: string, data?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) });
    }
  }
  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

vi.stubGlobal("EventSource", FakeEventSource);

const USER = { id: "1", name: "Nick", avatarUrl: null };

function ok(data: unknown) {
  return { ok: true, data };
}
function fail(error: string) {
  return { ok: false, error: { error, message: "x" } };
}

async function freshAuth() {
  const mod = await import("./auth.svelte");
  return mod.auth;
}

beforeEach(() => {
  vi.resetModules();
  getMock.mockReset();
  postMock.mockReset();
  FakeEventSource.instances = [];
});

describe("auth store", () => {
  it("começa unchecked", async () => {
    const auth = await freshAuth();
    expect(auth.status).toBe("unchecked");
    expect(auth.user).toBeNull();
  });

  it("checkAuth autenticado → status authenticated + stream SSE aberta", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    await auth.checkAuth();
    expect(auth.status).toBe("authenticated");
    expect(auth.user).toEqual(USER);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe("/api/events");
  });

  it("authenticated:false → unauthenticated", async () => {
    getMock.mockResolvedValue(ok({ authenticated: false }));
    const auth = await freshAuth();
    await auth.checkAuth();
    expect(auth.status).toBe("unauthenticated");
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("401 session_expired → unauthenticated", async () => {
    getMock.mockResolvedValue(fail("session_expired"));
    const auth = await freshAuth();
    await auth.checkAuth();
    expect(auth.status).toBe("unauthenticated");
  });

  it("401 session_replaced → session_replaced e stream fechada", async () => {
    getMock
      .mockResolvedValueOnce(ok({ authenticated: true, user: USER }))
      .mockResolvedValue(fail("session_replaced"));
    const auth = await freshAuth();
    await auth.checkAuth();
    const es = FakeEventSource.instances[0]!;
    await auth.checkAuth();
    expect(auth.status).toBe("session_replaced");
    expect(auth.user).toBeNull();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("erro de rede → status error", async () => {
    getMock.mockResolvedValue(fail("network"));
    const auth = await freshAuth();
    await auth.checkAuth();
    expect(auth.status).toBe("error");
  });

  it("evento SSE session_replaced marca a conta", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    await auth.checkAuth();
    FakeEventSource.instances[0]!.emit("session_replaced", { type: "session_replaced" });
    expect(auth.status).toBe("session_replaced");
  });

  it("evento profile_updated atualiza o usuário", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    await auth.checkAuth();
    FakeEventSource.instances[0]!.emit("profile_updated", {
      type: "profile_updated",
      name: "Novo Nome",
      avatarUrl: "https://cdn/x.png",
    });
    expect(auth.user?.name).toBe("Novo Nome");
    expect(auth.user?.avatarUrl).toBe("https://cdn/x.png");
  });

  it("checkAuth é single-flight: chamadas concorrentes dividem a request", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    await Promise.all([auth.checkAuth(), auth.checkAuth(), auth.checkAuth()]);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("stream CLOSED limpa a referência e a próxima checkAuth reabre", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    await auth.checkAuth();
    const first = FakeEventSource.instances[0]!;
    first.readyState = FakeEventSource.CLOSED;
    first.onerror?.();
    await auth.checkAuth();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]).not.toBe(first);
  });

  it("stream CLOSED agenda reconnect automático sem checkAuth externo", async () => {
    vi.useFakeTimers();
    try {
      getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
      const auth = await freshAuth();
      await auth.checkAuth();
      FakeEventSource.instances[0]!.readyState = FakeEventSource.CLOSED;
      FakeEventSource.instances[0]!.onerror?.();
      expect(FakeEventSource.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(FakeEventSource.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await auth.checkAuth();
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnect usa backoff crescente a cada falha", async () => {
    vi.useFakeTimers();
    try {
      getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
      const auth = await freshAuth();
      await auth.checkAuth();
      const es1 = FakeEventSource.instances[0]!;
      es1.readyState = FakeEventSource.CLOSED;
      es1.onerror?.();
      await vi.advanceTimersByTimeAsync(1_000);
      await auth.checkAuth();
      const es2 = FakeEventSource.instances[1]!;
      es2.readyState = FakeEventSource.CLOSED;
      es2.onerror?.();
      await vi.advanceTimersByTimeAsync(2_999);
      expect(FakeEventSource.instances).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      await auth.checkAuth();
      expect(FakeEventSource.instances).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("erro CONNECTING não agenda retry (browser reconecta sozinho)", async () => {
    vi.useFakeTimers();
    try {
      getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
      const auth = await freshAuth();
      await auth.checkAuth();
      const es = FakeEventSource.instances[0]!;
      es.readyState = 0;
      es.onerror?.();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(FakeEventSource.instances).toHaveLength(1);
      expect(getMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sessão substituída não agenda reconnect", async () => {
    vi.useFakeTimers();
    try {
      getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
      const auth = await freshAuth();
      await auth.checkAuth();
      const es = FakeEventSource.instances[0]!;
      auth.markSessionReplaced();
      es.onerror?.();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(FakeEventSource.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("open após erro dispara onSseOpen; open inicial não dispara", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    const onOpen = vi.fn();
    auth.onSseOpen(onOpen);
    await auth.checkAuth();
    const es = FakeEventSource.instances[0]!;
    es.emitOpen();
    expect(onOpen).not.toHaveBeenCalled();
    es.readyState = 0;
    es.onerror?.();
    es.emitOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
    es.emitOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("onSseOpen unsubscribe remove o handler", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    const onOpen = vi.fn();
    const unsub = auth.onSseOpen(onOpen);
    await auth.checkAuth();
    const es = FakeEventSource.instances[0]!;
    es.readyState = 0;
    es.onerror?.();
    unsub();
    es.emitOpen();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("onSseEvent despacha rooms_updated validado para o handler", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    const received: unknown[] = [];
    auth.onSseEvent("rooms_updated", (data) => received.push(data));
    await auth.checkAuth();
    FakeEventSource.instances[0]!.emit("rooms_updated", {
      type: "rooms_updated",
      room: "sala-a",
      live: true,
      participantCount: 3,
    });
    expect(received).toEqual([
      { type: "rooms_updated", room: "sala-a", live: true, participantCount: 3, occupants: [] },
    ]);
  });

  it("payload inválido não despacha nem lança", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    const received: unknown[] = [];
    auth.onSseEvent("rooms_updated", (data) => received.push(data));
    await auth.checkAuth();
    const es = FakeEventSource.instances[0]!;
    es.emit("rooms_updated", { type: "rooms_updated", room: "sala-a", live: true, participantCount: -1 });
    es.emit("rooms_updated", { room: "sala-a" });
    es.emit("rooms_updated", "não é objeto");
    expect(received).toEqual([]);
    expect(auth.status).toBe("authenticated");
  });

  it("unsubscribe para de receber eventos", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    const auth = await freshAuth();
    const received: unknown[] = [];
    const unsub = auth.onSseEvent("rooms_updated", (data) => received.push(data));
    await auth.checkAuth();
    const es = FakeEventSource.instances[0]!;
    es.emit("rooms_updated", { type: "rooms_updated", room: "a", live: true, participantCount: 1 });
    unsub();
    es.emit("rooms_updated", { type: "rooms_updated", room: "a", live: false, participantCount: 0 });
    expect(received).toHaveLength(1);
  });

  it("logout chama a API, limpa estado e redireciona", async () => {
    getMock.mockResolvedValue(ok({ authenticated: true, user: USER }));
    postMock.mockResolvedValue(ok({}));
    const href = { value: "" };
    vi.stubGlobal("window", { location: { set href(v: string) { href.value = v; } } });
    const auth = await freshAuth();
    await auth.checkAuth();
    await auth.logout();
    expect(postMock).toHaveBeenCalledWith("/api/auth/logout");
    expect(auth.status).toBe("unauthenticated");
    expect(href.value).toBe("/login?reason=logged_out");
    vi.unstubAllGlobals();
  });
});
