import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomEventHandlers } from "./connection.svelte";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("$lib/api/client", () => ({
  api: { get: getMock, post: postMock },
}));

const authMock = {
  user: { id: "1", name: "Nick", avatarUrl: null },
  markSessionReplaced: vi.fn(),
  checkAuth: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
};

vi.mock("$lib/auth/auth.svelte", () => ({ auth: authMock }));

vi.mock("$lib/utils/audio", () => ({
  detachAllAudio: vi.fn(),
  attachScreenShareAudio: vi.fn(),
  detachScreenShareAudio: vi.fn(),
  setAudioMuted: vi.fn(),
  setAudioVolume: vi.fn(),
  setAudioState: vi.fn(),
  onPiPVolumeChange: vi.fn(),
  syncVideoElement: vi.fn(),
}));

class FakeRoom extends EventEmitter {
  static instances: FakeRoom[] = [];
  static nextConnectError: Error | null = null;
  remoteParticipants = new Map();
  localParticipant = { sid: "local", identity: "user-x", publishData: vi.fn() };
  engine = { token: undefined as string | undefined };
  connect = vi.fn().mockImplementation((_url: string, token: string) => {
    this.engine.token = token;
    return FakeRoom.nextConnectError
      ? Promise.reject(FakeRoom.nextConnectError)
      : Promise.resolve();
  });
  disconnect = vi.fn().mockResolvedValue(undefined);
  removeAllListeners = vi.fn();
  constructor(public opts?: unknown) {
    super();
    FakeRoom.instances.push(this);
  }
}

vi.mock("livekit-client", () => ({
  Room: FakeRoom,
  RoomEvent: {
    TrackPublished: "trackPublished",
    TrackUnpublished: "trackUnpublished",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    ParticipantMetadataChanged: "participantMetadataChanged",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    SignalReconnecting: "signalReconnecting",
    Reconnected: "reconnected",
    DataReceived: "dataReceived",
  },
  DisconnectReason: { DUPLICATE_IDENTITY: "duplicate_identity", SERVER_SHUTDOWN: "server_shutdown" },
  Track: { Source: { ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" }, Kind: { Video: "video" } },
  VideoQuality: { HIGH: 2, MEDIUM: 1, LOW: 0 },
}));

async function loadStore() {
  vi.resetModules();
  const mod = await import("./connection.svelte");
  return mod.connectionStore;
}

const TOKEN = { token: "jwt", url: "ws://localhost:7880" };

function ok(data: unknown) {
  return { ok: true, data };
}
function err(error: string, message = "m") {
  return { ok: false, error: { error, message } };
}

beforeEach(() => {
  FakeRoom.instances.length = 0;
  FakeRoom.nextConnectError = null;
  vi.clearAllMocks();
});

describe("connect", () => {
  it("obtém token e conecta a Room com url/token retornados", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    await store.connect("sala-a");
    expect(getMock).toHaveBeenCalledWith("/api/token?room=sala-a");
    const room = FakeRoom.instances[0]!;
    expect(room.connect).toHaveBeenCalledWith("ws://localhost:7880", "jwt", {
      autoSubscribe: false,
    });
    expect(store.room).toBe(room);
    expect(store.loading).toBe(false);
  });

  it("single-flight: connect concorrente retorna a mesma promise", async () => {
    let resolveToken: (v: unknown) => void;
    getMock.mockReturnValue(new Promise((r) => (resolveToken = r)));
    const store = await loadStore();
    const p1 = store.connect("sala-a");
    const p2 = store.connect("sala-a");
    resolveToken!(ok(TOKEN));
    await Promise.all([p1, p2]);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(FakeRoom.instances).toHaveLength(1);
  });

  it("connect durante destroy em voo é single-flight (sem rooms duplicadas)", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    await store.connect("sala-a");
    const room1 = FakeRoom.instances[0]!;

    let releaseDisconnect: () => void;
    const disconnectGate = new Promise<void>((r) => (releaseDisconnect = r));
    room1.disconnect.mockReturnValue(disconnectGate);

    const d = store.destroy();
    const c1 = store.connect("sala-b");
    const c2 = store.connect("sala-b");
    releaseDisconnect!();
    await Promise.all([d, c1, c2]);
    expect(FakeRoom.instances).toHaveLength(2);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenLastCalledWith("/api/token?room=sala-b");
  });

  it("session_replaced no token chama markSessionReplaced", async () => {
    getMock.mockResolvedValue(err("session_replaced"));
    const store = await loadStore();
    await store.connect("sala-a");
    expect(authMock.markSessionReplaced).toHaveBeenCalled();
    expect(store.room).toBeNull();
  });

  it("outro erro de token expõe error+errorCode", async () => {
    getMock.mockResolvedValue(err("invalid_room", "Sala não encontrada"));
    const store = await loadStore();
    await store.connect("sala-x");
    expect(store.errorCode).toBe("invalid_room");
    expect(store.error).toBe("Sala não encontrada");
    expect(store.room).toBeNull();
  });

  it("destroy durante await connect descarta a sala órfã", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    let resolveConnect: () => void;
    const connectGate = new Promise<void>((r) => (resolveConnect = r));
    getMock.mockImplementation(async () => {
      await connectGate;
      return ok(TOKEN);
    });
    const p = store.connect("sala-a");
    const d = store.destroy();
    resolveConnect!();
    await Promise.all([p, d]);
    expect(store.room).toBeNull();
    const room = FakeRoom.instances[0];
    expect(room?.disconnect).toHaveBeenCalled();
  });

  it("resposta de token com shape inválido → erro, sem crash", async () => {
    getMock.mockResolvedValue(ok({ token: 123 }));
    const store = await loadStore();
    await store.connect("sala-a");
    expect(store.room).toBeNull();
    expect(store.error).toBe("Resposta inválida do servidor");
    expect(FakeRoom.instances).toHaveLength(0);
  });

  it("connect falhando desconecta pendingRoom e mantém room null", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    FakeRoom.nextConnectError = new Error("ws fail");
    await store.connect("sala-a");
    expect(store.room).toBeNull();
    expect(store.error).toBe("ws fail");
    expect(FakeRoom.instances[0]?.disconnect).toHaveBeenCalled();
  });

  it("connect(B) com connect(A) em voo enfileira — B conecta de verdade", async () => {
    let resolveTokenA: (v: unknown) => void;
    getMock.mockImplementation((url: string) =>
      url.includes("sala-a")
        ? new Promise((r) => (resolveTokenA = r))
        : Promise.resolve(ok(TOKEN)),
    );
    const store = await loadStore();
    const p1 = store.connect("sala-a");
    const p2 = store.connect("sala-b");
    resolveTokenA!(ok(TOKEN));
    await Promise.all([p1, p2]);
    // Sem a fila, connect(B) herdava a promise do A e nunca conectava —
    // loading=false + room=null = página em branco na navegação rápida.
    expect(getMock).toHaveBeenCalledWith("/api/token?room=sala-b");
    expect(store.room).toBe(FakeRoom.instances.at(-1));
    expect(store.loading).toBe(false);
    // A room superseded de A foi descartada sem virar this.room.
    expect(FakeRoom.instances[0]!.disconnect).toHaveBeenCalled();
  });

  it("connect enfileirado é abortado se destroy() vence antes", async () => {
    let resolveTokenA: (v: unknown) => void;
    getMock.mockImplementation((url: string) =>
      url.includes("sala-a")
        ? new Promise((r) => (resolveTokenA = r))
        : Promise.resolve(ok(TOKEN)),
    );
    const store = await loadStore();
    const p1 = store.connect("sala-a");
    const p2 = store.connect("sala-b");
    const d = store.destroy();
    resolveTokenA!(ok(TOKEN));
    await Promise.all([p1, p2, d]);
    // O connect(B) enfileirado não pode conectar uma sala que o usuário
    // já saiu — sai cedo e nem pede token.
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(store.room).toBeNull();
  });

  it("connect novo depois de destroy funciona (wantedRoom renova)", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    await store.connect("sala-a");
    await store.destroy();
    await store.connect("sala-b");
    expect(store.room).toBe(FakeRoom.instances.at(-1));
    expect(getMock).toHaveBeenLastCalledWith("/api/token?room=sala-b");
  });
});

describe("disconnect reasons", () => {
  it("DUPLICATE_IDENTITY → duplicate_identity + checkAuth single-flight", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    store.setHandlers({
      onTrackPublished: vi.fn(), onTrackUnpublished: vi.fn(), onTrackSubscribed: vi.fn(),
      onTrackUnsubscribed: vi.fn(), onTrackMuted: vi.fn(), onTrackUnmuted: vi.fn(),
      onLocalTrackPublished: vi.fn(), onLocalTrackUnpublished: vi.fn(),
      onParticipantConnected: vi.fn(), onParticipantDisconnected: vi.fn(),
      onParticipantMetadataChanged: vi.fn(), onDataReceived: vi.fn(),
    });
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("disconnected", "duplicate_identity");
    room.emit("disconnected", "duplicate_identity");
    expect(store.disconnectedReason).toBe("duplicate_identity");
    expect(authMock.checkAuth).toHaveBeenCalledTimes(1);
  });

  it("Disconnected terminal chama onTerminated (limpa stores da sala)", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    const handlers = mkHandlers();
    handlers.onTerminated = vi.fn();
    store.setHandlers(handlers);
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("disconnected", "duplicate_identity");
    expect(handlers.onTerminated).toHaveBeenCalledTimes(1);
    room.emit("disconnected", "server_shutdown");
    expect(handlers.onTerminated).toHaveBeenCalledTimes(2);
  });

  it("outro reason → disconnected", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    store.setHandlers({
      onTrackPublished: vi.fn(), onTrackUnpublished: vi.fn(), onTrackSubscribed: vi.fn(),
      onTrackUnsubscribed: vi.fn(), onTrackMuted: vi.fn(), onTrackUnmuted: vi.fn(),
      onLocalTrackPublished: vi.fn(), onLocalTrackUnpublished: vi.fn(),
      onParticipantConnected: vi.fn(), onParticipantDisconnected: vi.fn(),
      onParticipantMetadataChanged: vi.fn(), onDataReceived: vi.fn(),
    });
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("disconnected", "server_shutdown");
    expect(store.disconnectedReason).toBe("disconnected");
  });

  it("Reconnecting/SignalReconnecting → flag true; Reconnected → false", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    store.setHandlers({
      onTrackPublished: vi.fn(), onTrackUnpublished: vi.fn(), onTrackSubscribed: vi.fn(),
      onTrackUnsubscribed: vi.fn(), onTrackMuted: vi.fn(), onTrackUnmuted: vi.fn(),
      onLocalTrackPublished: vi.fn(), onLocalTrackUnpublished: vi.fn(),
      onParticipantConnected: vi.fn(), onParticipantDisconnected: vi.fn(),
      onParticipantMetadataChanged: vi.fn(), onDataReceived: vi.fn(),
    });
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("reconnecting");
    expect(store.reconnecting).toBe(true);
    room.emit("signalReconnecting");
    expect(store.reconnecting).toBe(true);
    room.emit("reconnected");
    expect(store.reconnecting).toBe(false);
  });

  it("Disconnected limpa a flag; destroy também", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    store.setHandlers({
      onTrackPublished: vi.fn(), onTrackUnpublished: vi.fn(), onTrackSubscribed: vi.fn(),
      onTrackUnsubscribed: vi.fn(), onTrackMuted: vi.fn(), onTrackUnmuted: vi.fn(),
      onLocalTrackPublished: vi.fn(), onLocalTrackUnpublished: vi.fn(),
      onParticipantConnected: vi.fn(), onParticipantDisconnected: vi.fn(),
      onParticipantMetadataChanged: vi.fn(), onDataReceived: vi.fn(),
    });
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("reconnecting");
    room.emit("disconnected", "server_shutdown");
    expect(store.reconnecting).toBe(false);
    await store.connect("sala-b");
    const room2 = FakeRoom.instances[1]!;
    room2.emit("reconnecting");
    expect(store.reconnecting).toBe(true);
    await store.destroy();
    expect(store.reconnecting).toBe(false);
  });
});

describe("destroy/logout", () => {
  it("destroy idempotente desconecta e limpa room", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    await store.destroy();
    await store.destroy();
    expect(store.room).toBeNull();
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it("logout desconecta e chama auth.logout", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    await store.connect("sala-a");
    await store.logout();
    expect(store.room).toBeNull();
    expect(authMock.logout).toHaveBeenCalled();
  });
});

function fakeJwt(expSec: number): string {
  return `h.${btoa(JSON.stringify({ exp: expSec }))}.s`;
}

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// "ÿÿ" gera bytes 0xFF → '/' em base64 → '_' em base64url: char que o atob
// estrito do browser rejeitaria sem a normalização.
function fakeJwtUrl(expSec: number): string {
  return `h.${b64url(JSON.stringify({ exp: expSec, x: "ÿÿ" }))}.s`;
}

function mkHandlers(): RoomEventHandlers {
  return {
    onTrackPublished: vi.fn(), onTrackUnpublished: vi.fn(), onTrackSubscribed: vi.fn(),
    onTrackUnsubscribed: vi.fn(), onTrackMuted: vi.fn(), onTrackUnmuted: vi.fn(),
    onLocalTrackPublished: vi.fn(), onLocalTrackUnpublished: vi.fn(),
    onParticipantConnected: vi.fn(), onParticipantDisconnected: vi.fn(),
    onParticipantMetadataChanged: vi.fn(), onDataReceived: vi.fn(),
  };
}

describe("track mute forwarding", () => {
  it("TrackMuted/TrackUnmuted → handlers com (pub, participant)", async () => {
    getMock.mockResolvedValue(ok(TOKEN));
    const store = await loadStore();
    const handlers = mkHandlers();
    store.setHandlers(handlers);
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    const pub = { source: "screen_share_audio" };
    const participant = { sid: "s1" };
    room.emit("trackMuted", pub, participant);
    expect(handlers.onTrackMuted).toHaveBeenCalledWith(pub, participant);
    room.emit("trackUnmuted", pub, participant);
    expect(handlers.onTrackUnmuted).toHaveBeenCalledWith(pub, participant);
  });
});

describe("token refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("JWT base64url (-/_) decodifica com atob estrito de browser", async () => {
    const realAtob = globalThis.atob;
    vi.stubGlobal("atob", (s: string) => {
      if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error("InvalidCharacterError");
      return realAtob(s);
    });
    const t1 = fakeJwtUrl(1600);
    const t2 = fakeJwtUrl(5200);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(ok({ token: t2, url: "ws://x" }));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(540_000);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(FakeRoom.instances[0]!.engine.token).toBe(t2);
  });

  it("agenda em exp-margin, escreve engine.token e reagenda", async () => {
    const t1 = fakeJwt(1600); // exp em +600s → refresh em +540s
    const t2 = fakeJwt(5200);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(ok({ token: t2, url: "ws://x" }));
    const store = await loadStore();
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;

    await vi.advanceTimersByTimeAsync(539_999);
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenLastCalledWith("/api/token?room=sala-a");
    expect(room.engine.token).toBe(t2);

    // reagendado pelo novo exp: 5200s - (1000s+540s) - 60s margin → +3600s
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it("transitório retenta até o cap e para", async () => {
    const t1 = fakeJwt(1600);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(err("unavailable"));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(540_000);
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(5_000);
    expect(getMock).toHaveBeenCalledTimes(1 + 1 + 3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getMock).toHaveBeenCalledTimes(5);
  });

  it("session_replaced → markSessionReplaced sem retry", async () => {
    const t1 = fakeJwt(1600);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(err("session_replaced"));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(540_000);
    expect(authMock.markSessionReplaced).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("session_expired → checkAuth sem retry", async () => {
    const t1 = fakeJwt(1600);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(err("session_expired"));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(540_000);
    expect(authMock.checkAuth).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("destroy cancela timer pendente", async () => {
    const t1 = fakeJwt(1600);
    getMock.mockResolvedValue(ok({ token: t1, url: "ws://x" }));
    const store = await loadStore();
    await store.connect("sala-a");
    await store.destroy();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("novo connect cancela o timer da sala anterior", async () => {
    const t1 = fakeJwt(1600);
    getMock.mockResolvedValue(ok({ token: t1, url: "ws://x" }));
    const store = await loadStore();
    await store.connect("sala-a");
    await store.connect("sala-b");
    await vi.advanceTimersByTimeAsync(540_000);
    expect(getMock).toHaveBeenLastCalledWith("/api/token?room=sala-b");
  });

  it("JWT sem exp decodável → não agenda", async () => {
    getMock.mockResolvedValue(ok({ token: "jwt-sem-exp", url: "ws://x" }));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(10_000_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("para de retentar após o exp do token (bound, não só cap)", async () => {
    const t1 = fakeJwt(1008); // exp em +8s → refresh imediato; expira antes do cap
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(err("unavailable"));
    const store = await loadStore();
    await store.connect("sala-a");
    await vi.advanceTimersByTimeAsync(1); // refresh #1 falha (t≈0 < 8s) → retry
    await vi.advanceTimersByTimeAsync(5_000); // #2 falha (t≈5 < 8s) → retry
    await vi.advanceTimersByTimeAsync(5_000); // #3 falha (t≈10 ≥ 8s) → para
    expect(getMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000); // sem bound haveria #5
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it("Disconnected terminal cancela o timer de refresh", async () => {
    const t1 = fakeJwt(1600);
    getMock.mockResolvedValue(ok({ token: t1, url: "ws://x" }));
    const store = await loadStore();
    store.setHandlers(mkHandlers());
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    room.emit("disconnected", "server_shutdown");
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("destroy limpa disconnectedReason stale", async () => {
    const t1 = fakeJwt(1600);
    getMock.mockResolvedValue(ok({ token: t1, url: "ws://x" }));
    const store = await loadStore();
    store.setHandlers(mkHandlers());
    await store.connect("sala-a");
    FakeRoom.instances[0]!.emit("disconnected", "server_shutdown");
    expect(store.disconnectedReason).toBe("disconnected");
    await store.destroy();
    expect(store.disconnectedReason).toBe("");
  });

  it("shape inválido não escreve engine.token e retenta", async () => {
    const t1 = fakeJwt(1600);
    getMock
      .mockResolvedValueOnce(ok({ token: t1, url: "ws://x" }))
      .mockResolvedValue(ok({ token: 123 }));
    const store = await loadStore();
    await store.connect("sala-a");
    const room = FakeRoom.instances[0]!;
    await vi.advanceTimersByTimeAsync(540_000);
    expect(room.engine.token).toBe(t1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getMock).toHaveBeenCalledTimes(3);
  });
});
