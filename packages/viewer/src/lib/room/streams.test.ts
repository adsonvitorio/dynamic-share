import type { Participant } from "livekit-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roomMock: {
  room: null | {
    remoteParticipants: Map<string, unknown>;
    localParticipant: { sid: string; identity: string; publishData: ReturnType<typeof vi.fn> };
  };
  userName: string;
} = {
  room: null,
  userName: "Nick",
};

vi.mock("./connection.svelte", () => ({
  connectionStore: roomMock,
}));

const authMock = { user: { id: "1", name: "Nick", avatarUrl: "https://cdn.discordapp.com/a.png" } };
vi.mock("$lib/auth/auth.svelte", () => ({ auth: authMock }));

const syncVideoElementMock = vi.fn();
const cleanupVideoSyncMock = vi.fn();
vi.mock("$lib/utils/audio", () => ({
  syncVideoElement: syncVideoElementMock,
  cleanupVideoSync: cleanupVideoSyncMock,
  detachAllAudio: vi.fn(),
  attachScreenShareAudio: vi.fn(),
  pruneScreenShareAudio: vi.fn(),
  withVideoSyncSuppressed: (_sid: string, fn: () => unknown) => fn(),
}));

const publishDataMock = vi.fn();
vi.mock("$lib/utils/livekit-data", () => ({ publishData: publishDataMock }));

const eventSound = vi.fn();
vi.mock("$lib/utils/notify-sound", () => ({
  playEventSound: eventSound,
}));

const exitPiPMock = vi.fn();
const exitFullscreenMock = vi.fn();
vi.mock("$lib/utils/dom", () => ({
  exitPiP: exitPiPMock,
  exitFullscreen: exitFullscreenMock,
}));

const notifyMock = vi.fn();
vi.mock("./notifications.svelte", () => ({
  notifications: { notify: notifyMock },
}));

class FakeTrack {
  attach = vi.fn();
  detach = vi.fn();
}
class FakePublication {
  constructor(public source: string) {}
  setSubscribed = vi.fn().mockResolvedValue(undefined);
}

vi.mock("livekit-client", () => ({
  Track: Object.assign(FakeTrack, {
    Source: { ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" },
  }),
  RemoteTrackPublication: FakePublication,
  VideoQuality: { HIGH: 2, MEDIUM: 1, LOW: 0 },
}));

const AVATAR_META = JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/r.png" });

type TestParticipant = Participant & {
  addPub(source: string): FakePublication;
};

function makeParticipant(
  sid: string,
  opts: { identity?: string; name?: string; metadata?: string } = {},
): TestParticipant {
  const pubs = new Map<string, FakePublication>();
  return {
    sid,
    identity: opts.identity ?? `id-${sid}`,
    name: opts.name,
    metadata: opts.metadata ?? AVATAR_META,
    getTrackPublication: (source: string) => pubs.get(source),
    addPub(source: string) {
      const pub = new FakePublication(source);
      pubs.set(source, pub);
      return pub;
    },
  } as unknown as TestParticipant;
}

const elements = new Map<string, unknown>();
let rafId = 0;
const rafQueue = new Map<number, FrameRequestCallback>();

function flushRaf(times = 1): void {
  for (let i = 0; i < times; i++) {
    const batch = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of batch) cb(0);
  }
}

const documentMock = {
  getElementById: (id: string) => elements.get(id) ?? null,
  pictureInPictureElement: null as unknown,
  exitPictureInPicture: vi.fn().mockResolvedValue(undefined),
  fullscreenElement: null as unknown,
  exitFullscreen: vi.fn().mockResolvedValue(undefined),
};

vi.stubGlobal("document", documentMock);
vi.stubGlobal(
  "requestAnimationFrame",
  (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  },
);
vi.stubGlobal("cancelAnimationFrame", (id: number) => rafQueue.delete(id));
class FakeMedia {
  id = "";
  srcObject: unknown = null;
}
class FakeVideoEl extends FakeMedia {}
vi.stubGlobal("HTMLMediaElement", FakeMedia);
vi.stubGlobal("HTMLVideoElement", FakeVideoEl);

async function loadStore() {
  vi.resetModules();
  const mod = await import("./streams.svelte");
  return mod.streamsStore;
}

function setRoom(sids: string[] = []) {
  const room = {
    remoteParticipants: new Map(sids.map((s) => [s, makeParticipant(s)])),
    localParticipant: { sid: "local", identity: "user-x", publishData: vi.fn() },
  };
  roomMock.room = room;
  return room;
}

function mediaEl(id: string) {
  const el = new FakeVideoEl();
  el.id = id;
  elements.set(id, el);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  elements.clear();
  rafQueue.clear();
  roomMock.room = null;
  roomMock.userName = "Nick";
  documentMock.pictureInPictureElement = null;
  documentMock.fullscreenElement = null;
});

describe("availableStreams", () => {
  it("adiciona stream remota com avatar do metadata e nome sanitizado", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1", { name: "<b>Ana</b>" });
    store.addAvailableStream(p);
    expect(store.availableStreams).toEqual([
      {
        participantSid: "s1",
        identity: "id-s1",
        name: "bAna/b",
        isLocal: false,
        avatarUrl: "https://cdn.discordapp.com/r.png",
      },
    ]);
  });

  it("stream local usa avatar da auth e nome do usuário", async () => {
    const store = await loadStore();
    const p = makeParticipant("local");
    store.addAvailableStream(p, true);
    expect(store.availableStreams[0]).toMatchObject({
      isLocal: true,
      name: "Nick",
      avatarUrl: "https://cdn.discordapp.com/a.png",
    });
  });

  it("dedup por sid e remove", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    store.addAvailableStream(p);
    store.addAvailableStream(p);
    expect(store.availableStreams).toHaveLength(1);
    store.removeAvailableStream(p);
    expect(store.availableStreams).toHaveLength(0);
  });

  it("updateAvailableStream propaga avatar para stream e card", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    store.addAvailableStream(p);
    store.addVideoCard(p, new FakeTrack() as never, false);
    const updated = makeParticipant("s1", {
      metadata: JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/new.png" }),
    });
    store.updateAvailableStream(updated);
    expect(store.availableStreams[0]?.avatarUrl).toBe("https://cdn.discordapp.com/new.png");
    expect(store.videoCards[0]?.avatarUrl).toBe("https://cdn.discordapp.com/new.png");
  });
});

describe("videoCards", () => {
  it("anexa track ao elemento video-<sid> via rAF", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    const el = mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    flushRaf();
    expect(track.attach).toHaveBeenCalledWith(el);
    expect(syncVideoElementMock).toHaveBeenCalledWith("s1", el);
  });

  it("attach no mount do elemento quando ele renderiza depois do card (sem rAF)", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    store.addVideoCard(p, track as never, false);
    // Elemento monta DEPOIS do card (flush do Svelte) — o use:videoAttach
    // precisa encontrar a track no mapa na hora, sem esperar rAF (que não
    // dispara em aba backgrounded ao compartilhar outra aba).
    const el = mediaEl("video-s1");
    store.attachVideoElement("s1", el as never);
    expect(track.attach).toHaveBeenCalledWith(el);
    expect(syncVideoElementMock).toHaveBeenCalledWith("s1", el);
  });

  it("anexa na hora quando o elemento já está montado (sem rAF — aba em background)", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    const el = mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    // rAF não dispara em aba backgrounded — o attach não pode depender dele.
    expect(track.attach).toHaveBeenCalledWith(el);
    expect(syncVideoElementMock).toHaveBeenCalledWith("s1", el);
  });

  it("trackDims lê width/height do mediaStreamTrack.getSettings()", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack() as FakeTrack & {
      mediaStreamTrack: { getSettings(): { width: number; height: number } };
    };
    track.mediaStreamTrack = { getSettings: () => ({ width: 1920, height: 1080 }) };
    store.addVideoCard(p, track as never, false);
    expect(store.trackDims("s1")).toEqual({ width: 1920, height: 1080 });
  });

  it("trackDims retorna undefined sem track ou sem dims", async () => {
    const store = await loadStore();
    expect(store.trackDims("ghost")).toBeUndefined();
    const p = makeParticipant("s1");
    store.addVideoCard(p, new FakeTrack() as never, false);
    expect(store.trackDims("s1")).toBeUndefined();
  });

  it("republicação detacha a track anterior e anexa a nova", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    mediaEl("video-s1");
    const t1 = new FakeTrack();
    const t2 = new FakeTrack();
    store.addVideoCard(p, t1 as never, false);
    flushRaf();
    store.addVideoCard(p, t2 as never, false);
    flushRaf();
    expect(t1.detach).toHaveBeenCalled();
    expect(t2.attach).toHaveBeenCalled();
    expect(store.videoCards).toHaveLength(1);
  });

  it("removeVideoCard cancela rAF pendente, detacha e remove card", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    const el = mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    flushRaf();
    store.removeVideoCard(p);
    expect(track.detach).toHaveBeenCalledWith(el);
    expect(store.videoCards).toHaveLength(0);
  });

  it("removeVideoCard sai do PiP quando o vídeo removido está em PiP", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const el = mediaEl("video-s1");
    store.addVideoCard(p, new FakeTrack() as never, false);
    flushRaf();
    documentMock.pictureInPictureElement = el;
    store.removeVideoCard(p);
    expect(documentMock.exitPictureInPicture).toHaveBeenCalled();
  });
});

describe("pruneDisconnected", () => {
  // Reproduz o kick por duplicate-identity: B entra com a identity de A →
  // o SDK faz updateInfo in-place no objeto de A (sid vira o de B) → o
  // disconnect de A chega carregando o objeto mutado (sid-b) → a remoção
  // por sid erra o card de sid-a. Só a varredura por sids vivos limpa.
  it("evento com sid mutado ainda limpa card/stream da sessão morta", async () => {
    const store = await loadStore();
    const room = setRoom(["sid-a"]);
    const pA = room.remoteParticipants.get("sid-a")! as TestParticipant;
    store.addAvailableStream(pA);
    store.addVideoCard(pA, new FakeTrack() as never, false);
    store.addSubscribed("sid-a");
    store.setHasAudio("sid-a", true);
    store.streamViewers = { "sid-a": [{ name: "V", identity: "v", avatarUrl: null }] };
    store.focusedSid = "sid-a";
    expect(store.videoCards).toHaveLength(1);

    // SDK: updateInfo muta o sid in-place; handleParticipantDisconnected
    // remove do mapa e emite o evento com o objeto já mutado.
    pA.sid = "sid-b";
    room.remoteParticipants.clear();
    store.removeVideoCard(pA); // sid-b — erra o card sid-a (o bug)
    store.removeAvailableStream(pA);
    expect(store.videoCards).toHaveLength(1);
    expect(store.availableStreams).toHaveLength(1);

    store.pruneDisconnected(new Set(["local"]));
    expect(store.videoCards).toHaveLength(0);
    expect(store.availableStreams).toHaveLength(0);
    expect(store.subscribedSids.has("sid-a")).toBe(false);
    expect(store.hasAudioTrack["sid-a"]).toBeUndefined();
    expect(store.streamViewers["sid-a"]).toBeUndefined();
    expect(store.focusedSid).toBeNull();
  });

  it("mantém entradas de participantes vivos e o card local", async () => {
    const store = await loadStore();
    setRoom(["sid-b"]);
    const pLocal = makeParticipant("local", { identity: "user-x", name: "Nick" });
    const pB = makeParticipant("sid-b");
    store.addVideoCard(pLocal, new FakeTrack() as never, true);
    store.addAvailableStream(pB);
    store.addSubscribed("sid-b");
    store.pruneDisconnected(new Set(["local", "sid-b"]));
    expect(store.videoCards).toHaveLength(1);
    expect(store.availableStreams).toHaveLength(1);
    expect(store.subscribedSids.has("sid-b")).toBe(true);
  });
});

describe("attachVideoElement", () => {
  it("anexa a track conhecida ao elemento e sincroniza", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    flushRaf();
    const el2 = mediaEl("video-s1-remount");
    store.attachVideoElement("s1", el2 as never);
    expect(track.attach).toHaveBeenCalledWith(el2);
    expect(syncVideoElementMock).toHaveBeenCalledWith("s1", el2);
  });

  it("ignora sid sem track conhecida", async () => {
    const store = await loadStore();
    const el = mediaEl("video-ghost");
    store.attachVideoElement("ghost", el as never);
    expect(syncVideoElementMock).not.toHaveBeenCalled();
  });

  it("detachVideoElement limpa o sync e detacha a track do elemento", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    const el = mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    flushRaf();
    store.detachVideoElement("s1", el as never);
    expect(cleanupVideoSyncMock).toHaveBeenCalledWith("s1");
    expect(track.detach).toHaveBeenCalledWith(el);
  });
});

describe("subscriptions", () => {
  it("toggleSubscribe inscreve video+áudio e anuncia viewership", async () => {
    const store = await loadStore();
    const room = setRoom(["s1"]);
    const p = room.remoteParticipants.get("s1") as ReturnType<typeof makeParticipant>;
    const videoPub = p.addPub("screen_share");
    const audioPub = p.addPub("screen_share_audio");
    await store.toggleSubscribe("s1");
    expect(videoPub.setSubscribed).toHaveBeenCalledWith(true);
    expect(audioPub.setSubscribed).toHaveBeenCalledWith(true);
    expect(publishDataMock).toHaveBeenCalledWith(
      roomMock.room,
      expect.objectContaining({ type: "viewership", streamSid: "s1", watching: true }),
    );
    expect(eventSound).toHaveBeenCalledWith("streamOpen");
  });

  it("toggleSubscribe desinscreve quando já inscrito", async () => {
    const store = await loadStore();
    const room = setRoom(["s1"]);
    const p = room.remoteParticipants.get("s1") as ReturnType<typeof makeParticipant>;
    const videoPub = p.addPub("screen_share");
    store.addSubscribed("s1");
    await store.toggleSubscribe("s1");
    expect(videoPub.setSubscribed).toHaveBeenCalledWith(false);
    expect(eventSound).toHaveBeenCalledWith("streamClose");
  });

  it("openStream inscreve quando necessário e sempre foca", async () => {
    const store = await loadStore();
    const room = setRoom(["s1"]);
    const p = room.remoteParticipants.get("s1") as ReturnType<typeof makeParticipant>;
    const pub = p.addPub("screen_share");
    store.addSubscribed("s1");
    await store.openStream("s1");
    expect(pub.setSubscribed).not.toHaveBeenCalled();
    expect(store.focusedSid).toBe("s1");
  });
});

describe("removeVideoCard sem elemento", () => {
  it("limpa attachedTracks mesmo sem elemento no DOM (sem reattach stale)", async () => {
    const store = await loadStore();
    const p = makeParticipant("s1");
    const track = new FakeTrack();
    mediaEl("video-s1");
    store.addVideoCard(p, track as never, false);
    flushRaf();
    expect(track.attach).toHaveBeenCalledTimes(1);
    elements.delete("video-s1");
    store.removeVideoCard(p);
    const el2 = mediaEl("video-s1");
    store.attachVideoElement("s1", el2 as never);
    expect(track.attach).toHaveBeenCalledTimes(1);
    expect(syncVideoElementMock).toHaveBeenCalledTimes(1);
  });
});

describe("releaseMediaOverlays", () => {
  it("encerra PiP e fullscreen quando a sala cai", async () => {
    const store = await loadStore();
    documentMock.fullscreenElement = { id: "card-s1" };
    store.releaseMediaOverlays();
    expect(exitPiPMock).toHaveBeenCalledTimes(1);
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it("sempre delega ao exitFullscreen — a guarda vive no helper (dom.test.ts)", async () => {
    const store = await loadStore();
    store.releaseMediaOverlays();
    expect(exitPiPMock).toHaveBeenCalledTimes(1);
    expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
  });
});

describe("viewership", () => {
  it("ignora streamSid desconhecido", async () => {
    const store = await loadStore();
    setRoom();
    const p = makeParticipant("viewer1");
    store.updateViewership(p, "sid-desconhecido", true);
    expect(store.streamViewers["sid-desconhecido"]).toBeUndefined();
  });

  it("adiciona e remove viewer em sid conhecido, notificando co-espectador", async () => {
    const store = await loadStore();
    setRoom();
    const host = makeParticipant("s1");
    store.addAvailableStream(host);
    const viewer = makeParticipant("v1", { name: "Ana" });
    store.addSubscribed("s1");
    store.updateViewership(viewer, "s1", true);
    expect(store.streamViewers["s1"]).toHaveLength(1);
    expect(store.streamViewers["s1"]?.[0]).toMatchObject({ name: "Ana", identity: "id-v1" });
    expect(notifyMock).toHaveBeenCalledWith(
      "coviewer_join",
      expect.objectContaining({ name: "Ana" }),
    );
    store.updateViewership(viewer, "s1", false);
    expect(store.streamViewers["s1"]).toHaveLength(0);
    expect(notifyMock).toHaveBeenLastCalledWith(
      "coviewer_leave",
      expect.objectContaining({ name: "Ana" }),
    );
    expect(eventSound).not.toHaveBeenCalled();
  });

  it("viewer no stream local gera notificação de presença, não som direto", async () => {
    const store = await loadStore();
    setRoom();
    const viewer = makeParticipant("v1", { name: "Ana" });
    store.updateViewership(viewer, "local", true);
    expect(store.streamViewers["local"]).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledWith(
      "viewer_join",
      expect.objectContaining({ name: "Ana" }),
    );
    expect(eventSound).not.toHaveBeenCalled();
    store.updateViewership(viewer, "local", false);
    expect(notifyMock).toHaveBeenLastCalledWith(
      "viewer_leave",
      expect.objectContaining({ name: "Ana" }),
    );
  });

  it("viewer em stream não assistida não toca som nem notifica", async () => {
    const store = await loadStore();
    setRoom();
    const host = makeParticipant("s1");
    store.addAvailableStream(host);
    const viewer = makeParticipant("v1");
    store.updateViewership(viewer, "s1", true);
    expect(eventSound).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("removeViewerFromAll remove de todos os streams", async () => {
    const store = await loadStore();
    setRoom();
    for (const sid of ["s1", "s2"]) store.addAvailableStream(makeParticipant(sid));
    const viewer = makeParticipant("v1");
    store.updateViewership(viewer, "s1", true);
    store.updateViewership(viewer, "s2", true);
    store.removeViewerFromAll("id-v1");
    expect(store.streamViewers["s1"]).toHaveLength(0);
    expect(store.streamViewers["s2"]).toHaveLength(0);
  });

  it("removeViewerFromAll notifica coviewer_leave em stream assistida", async () => {
    const store = await loadStore();
    setRoom();
    store.addAvailableStream(makeParticipant("s1"));
    store.addSubscribed("s1");
    const viewer = makeParticipant("v1");
    store.updateViewership(viewer, "s1", true);
    notifyMock.mockClear();
    store.removeViewerFromAll("id-v1");
    expect(notifyMock).toHaveBeenCalledWith(
      "coviewer_leave",
      expect.objectContaining({ name: "id-v1" }),
    );
  });

  it("updateViewersAvatar só reescreve quando algo muda", async () => {
    const store = await loadStore();
    setRoom();
    store.addAvailableStream(makeParticipant("s1"));
    const viewer = makeParticipant("v1", { metadata: AVATAR_META });
    store.updateViewership(viewer, "s1", true);
    const before = store.streamViewers;
    store.updateViewersAvatar(makeParticipant("v1", { metadata: AVATAR_META }));
    expect(store.streamViewers).toBe(before);
    store.updateViewersAvatar(
      makeParticipant("v1", {
        metadata: JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/z.png" }),
      }),
    );
    expect(store.streamViewers["s1"]?.[0]?.avatarUrl).toBe(
      "https://cdn.discordapp.com/z.png",
    );
  });

  it("announceViewership publica só streamSid/watching — identidade vem do transporte", async () => {
    const store = await loadStore();
    setRoom();
    store.announceViewership("s1", true);
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "viewership",
      streamSid: "s1",
      watching: true,
    });
  });

  it("inclui o próprio viewer na lista ao assistir e remove ao sair", async () => {
    const store = await loadStore();
    const room = setRoom(["s1"]);
    const p = room.remoteParticipants.get("s1") as ReturnType<typeof makeParticipant>;
    p.addPub("screen_share");
    await store.toggleSubscribe("s1");
    expect(store.streamViewers["s1"]).toHaveLength(1);
    expect(store.streamViewers["s1"]?.[0]).toMatchObject({
      identity: "user-x",
      name: "Nick",
      avatarUrl: "https://cdn.discordapp.com/a.png",
    });
    // TrackSubscribed do LiveKit confirma a inscrição (evento real no app).
    store.addSubscribed("s1");
    await store.toggleSubscribe("s1");
    expect(store.streamViewers["s1"]).toHaveLength(0);
  });

  it("viewer local é idempotente e convive com viewers remotos", async () => {
    const store = await loadStore();
    setRoom();
    store.addAvailableStream(makeParticipant("s1"));
    const remote = makeParticipant("v1", { name: "Ana" });
    store.updateViewership(remote, "s1", true);
    store.announceViewership("s1", true);
    store.announceViewership("s1", true);
    expect(store.streamViewers["s1"]).toHaveLength(2);
    expect(store.streamViewers["s1"]?.[0]?.identity).toBe("user-x");
    expect(store.streamViewers["s1"]?.[1]?.identity).toBe("id-v1");
  });
});

describe("reset", () => {
  it("cancela rAF pendente e limpa todo o estado", async () => {
    const store = await loadStore();
    setRoom();
    const p = makeParticipant("s1");
    store.addAvailableStream(p);
    store.addVideoCard(p, new FakeTrack() as never, false);
    store.addSubscribed("s1");
    store.updateViewership(makeParticipant("v1"), "s1", true);
    store.setHasAudio("s1", true);
    store.focusedSid = "s1";
    store.reset();
    flushRaf();
    expect(store.videoCards).toEqual([]);
    expect(store.availableStreams).toEqual([]);
    expect(store.subscribedSids.size).toBe(0);
    expect(store.streamViewers).toEqual({});
    expect(store.hasAudioTrack).toEqual({});
    expect(store.focusedSid).toBeNull();
  });
});
