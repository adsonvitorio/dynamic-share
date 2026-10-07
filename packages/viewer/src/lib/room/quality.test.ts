import { beforeEach, describe, expect, it, vi } from "vitest";

const roomMock: {
  room: null | {
    remoteParticipants: Map<string, { sid: string; trackPublications: Map<string, unknown> }>;
    localParticipant: { getTrackPublication: (s: string) => unknown };
  };
} = { room: null };
vi.mock("./connection.svelte", () => ({ connectionStore: roomMock }));

const sharingMock = { isSharing: false };
vi.mock("./sharing.svelte", () => ({ sharingStore: sharingMock }));

const setAudioMutedMock = vi.fn();
const setAudioVolumeMock = vi.fn();
const setAudioStateMock = vi.fn();
let pipCallback: ((sid: string, muted: boolean, volume: number) => void) | null = null;
vi.mock("$lib/utils/audio", () => ({
  setAudioMuted: setAudioMutedMock,
  setAudioVolume: setAudioVolumeMock,
  setAudioState: setAudioStateMock,
  onPiPVolumeChange: (cb: typeof pipCallback) => {
    pipCallback = cb;
  },
}));

const publishDataMock = vi.fn();
vi.mock("$lib/utils/livekit-data", () => ({ publishData: publishDataMock }));

class FakeLocalTrack {
  constructor(public mediaStreamTrack: { applyConstraints: ReturnType<typeof vi.fn> }) {}
}
class FakeRemotePub {
  kind = "video";
  source = "screen_share";
  setVideoQuality = vi.fn();
}

vi.mock("livekit-client", () => ({
  Track: {
    Source: { ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" },
    Kind: { Video: "video" },
  },
  VideoQuality: { HIGH: 2, MEDIUM: 1, LOW: 0 },
  LocalTrack: FakeLocalTrack,
  RemoteTrackPublication: FakeRemotePub,
}));

async function loadStore() {
  vi.resetModules();
  const mod = await import("./quality.svelte");
  return mod.qualityStore;
}

beforeEach(() => {
  vi.clearAllMocks();
  roomMock.room = null;
  sharingMock.isSharing = false;
  pipCallback = null;
});

describe("setQuality", () => {
  it("sem sid atualiza só o default, sem aplicar nos pubs", async () => {
    const store = await loadStore();
    const pub = new FakeRemotePub();
    roomMock.room = {
      remoteParticipants: new Map([
        ["s1", { sid: "s1", trackPublications: new Map([["p1", pub]]) }],
      ]),
      localParticipant: { getTrackPublication: () => undefined },
    };
    store.setQuality("low");
    expect(store.quality).toBe("low");
    expect(pub.setVideoQuality).not.toHaveBeenCalled();
  });

  it("com sid aplica só naquele participante; auto→HIGH", async () => {
    const store = await loadStore();
    const pub = new FakeRemotePub();
    const other = new FakeRemotePub();
    other.source = "camera";
    const pub2 = new FakeRemotePub();
    roomMock.room = {
      remoteParticipants: new Map([
        ["s1", { sid: "s1", trackPublications: new Map([["p1", pub], ["p2", other]]) }],
        ["s2", { sid: "s2", trackPublications: new Map([["p3", pub2]]) }],
      ]),
      localParticipant: { getTrackPublication: () => undefined },
    };
    store.setQuality("low", "s1");
    expect(pub.setVideoQuality).toHaveBeenCalledWith(0);
    expect(other.setVideoQuality).not.toHaveBeenCalled();
    expect(pub2.setVideoQuality).not.toHaveBeenCalled();
    expect(store.quality).toBe("auto");
    store.setQuality("auto", "s1");
    expect(pub.setVideoQuality).toHaveBeenLastCalledWith(2);
  });

  it("applyQuality usa o mapa do sid; sem entrada cai no default", async () => {
    const store = await loadStore();
    const pub1 = new FakeRemotePub();
    const pub2 = new FakeRemotePub();
    roomMock.room = {
      remoteParticipants: new Map([
        ["s1", { sid: "s1", trackPublications: new Map([["p1", pub1]]) }],
        ["s2", { sid: "s2", trackPublications: new Map([["p2", pub2]]) }],
      ]),
      localParticipant: { getTrackPublication: () => undefined },
    };
    store.setQuality("low");
    store.setQuality("high", "s1");
    store.applyQuality("s1");
    store.applyQuality("s2");
    expect(pub1.setVideoQuality).toHaveBeenCalledWith(2);
    expect(pub2.setVideoQuality).toHaveBeenCalledWith(0);
  });

  it("qualityFor reflete mapa do sid ou default", async () => {
    const store = await loadStore();
    expect(store.qualityFor("s1")).toBe("auto");
    expect(store.qualityFor(null)).toBe("auto");
    store.setQuality("medium", "s1");
    store.setQuality("low");
    expect(store.qualityFor("s1")).toBe("medium");
    expect(store.qualityFor("s2")).toBe("low");
    expect(store.qualityFor(null)).toBe("low");
  });
});

describe("setUploadQuality / setUploadFps", () => {
  it("sem sharing só atualiza estado, sem publish", async () => {
    const store = await loadStore();
    roomMock.room = {
      remoteParticipants: new Map(),
      localParticipant: { getTrackPublication: () => undefined },
    };
    await store.setUploadQuality("360");
    expect(store.uploadQuality).toBe("360");
    expect(publishDataMock).not.toHaveBeenCalled();
    await store.setUploadFps("15");
    expect(store.uploadFps).toBe("15");
    expect(publishDataMock).not.toHaveBeenCalled();
  });

  it("sharing sem track local atualiza estado e publica", async () => {
    const store = await loadStore();
    sharingMock.isSharing = true;
    roomMock.room = {
      remoteParticipants: new Map(),
      localParticipant: { getTrackPublication: () => undefined },
    };
    await store.setUploadQuality("480");
    expect(store.uploadQuality).toBe("480");
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-quality",
      quality: "480",
    });
  });

  it("com track aplica constraints e publica após sucesso", async () => {
    const store = await loadStore();
    sharingMock.isSharing = true;
    const media = { applyConstraints: vi.fn().mockResolvedValue(undefined) };
    roomMock.room = {
      remoteParticipants: new Map(),
      localParticipant: {
        getTrackPublication: () => ({ track: new FakeLocalTrack(media) }),
      },
    };
    await store.setUploadQuality("360");
    expect(media.applyConstraints).toHaveBeenCalledWith(
      expect.objectContaining({ width: { ideal: 640, max: 640 } }),
    );
    expect(store.uploadQuality).toBe("360");
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-quality",
      quality: "360",
    });
    await store.setUploadFps("15");
    expect(media.applyConstraints).toHaveBeenCalledWith({ frameRate: 15 });
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-fps",
      fps: "15",
    });
  });

  it("applyConstraints falhando não atualiza estado nem publica", async () => {
    const store = await loadStore();
    sharingMock.isSharing = true;
    const media = { applyConstraints: vi.fn().mockRejectedValue(new Error("x")) };
    roomMock.room = {
      remoteParticipants: new Map(),
      localParticipant: {
        getTrackPublication: () => ({ track: new FakeLocalTrack(media) }),
      },
    };
    await store.setUploadQuality("480");
    expect(store.uploadQuality).toBe("720");
    expect(publishDataMock).not.toHaveBeenCalled();
  });
});

describe("remote audio", () => {
  it("toggleRemoteAudio alterna e sincroniza setAudioState", async () => {
    const store = await loadStore();
    store.toggleRemoteAudio("s1");
    expect(setAudioMutedMock).toHaveBeenCalledWith("s1", true);
    expect(store.remoteAudioMuted["s1"]).toBe(true);
    expect(setAudioStateMock).toHaveBeenCalled();
    store.toggleRemoteAudio("s1");
    expect(setAudioMutedMock).toHaveBeenCalledWith("s1", false);
  });

  it("setRemoteVolume clampa [0,1]; v=0 muta; v>0 desmuta", async () => {
    const store = await loadStore();
    store.setRemoteVolume("s1", 2.5);
    expect(setAudioVolumeMock).toHaveBeenCalledWith("s1", 1);
    expect(store.remoteAudioVolume["s1"]).toBe(1);
    store.setRemoteVolume("s1", -1);
    expect(setAudioVolumeMock).toHaveBeenCalledWith("s1", 0);
    expect(setAudioMutedMock).toHaveBeenCalledWith("s1", true);
    expect(store.remoteAudioMuted["s1"]).toBe(true);
    store.setRemoteVolume("s1", 0.5);
    expect(setAudioMutedMock).toHaveBeenCalledWith("s1", false);
    expect(store.remoteAudioMuted["s1"]).toBe(false);
    store.setRemoteVolume("s1", Number.NaN);
    expect(store.remoteAudioVolume["s1"]).toBe(0.5);
  });

  it("onPiPChange espelha muted/volume no estado", async () => {
    const store = await loadStore();
    expect(pipCallback).not.toBeNull();
    pipCallback!("s1", true, 0.3);
    expect(store.remoteAudioMuted["s1"]).toBe(true);
    expect(store.remoteAudioVolume["s1"]).toBe(0.3);
  });

  it("removeRemoteAudio limpa entradas do sid", async () => {
    const store = await loadStore();
    store.toggleRemoteAudio("s1");
    store.setRemoteVolume("s1", 0.4);
    store.removeRemoteAudio("s1");
    expect(store.remoteAudioMuted["s1"]).toBeUndefined();
    expect(store.remoteAudioVolume["s1"]).toBeUndefined();
  });
});

describe("remote upload quality/fps", () => {
  it("rejeita sid desconhecido", async () => {
    const store = await loadStore();
    roomMock.room = {
      remoteParticipants: new Map([["s1", { sid: "s1", trackPublications: new Map() }]]),
      localParticipant: { getTrackPublication: () => undefined },
    };
    store.setRemoteUploadQuality("desconhecido", "480");
    store.setRemoteUploadFps("desconhecido", "15");
    expect(store.remoteUploadQualities["desconhecido"]).toBeUndefined();
    expect(store.remoteUploadFps["desconhecido"]).toBeUndefined();
    store.setRemoteUploadQuality("s1", "480");
    store.setRemoteUploadFps("s1", "15");
    store.setQuality("low", "s1");
    expect(store.remoteUploadQualities["s1"]).toBe("480");
    expect(store.remoteUploadFps["s1"]).toBe("15");
    expect(store.streamQualities["s1"]).toBe("low");
    store.removeRemoteQuality("s1");
    expect(store.remoteUploadQualities["s1"]).toBeUndefined();
    expect(store.streamQualities["s1"]).toBeUndefined();
  });
});

describe("pruneDisconnected", () => {
  it("remove entradas de sids mortos e re-sincroniza audio state", async () => {
    const store = await loadStore();
    store.streamQualities = { "sid-a": "low", "sid-b": "high" };
    store.remoteUploadQualities = { "sid-a": "480" };
    store.remoteUploadFps = { "sid-a": "15" };
    store.remoteAudioMuted = { "sid-a": true, "sid-b": false };
    store.remoteAudioVolume = { "sid-a": 0.5 };
    store.pruneDisconnected(new Set(["sid-b"]));
    expect(store.streamQualities).toEqual({ "sid-b": "high" });
    expect(store.remoteUploadQualities).toEqual({});
    expect(store.remoteUploadFps).toEqual({});
    expect(store.remoteAudioMuted).toEqual({ "sid-b": false });
    expect(store.remoteAudioVolume).toEqual({});
    expect(setAudioStateMock).toHaveBeenLastCalledWith({ "sid-b": false }, {});
  });
});

describe("reset", () => {
  it("restaura defaults", async () => {
    const store = await loadStore();
    store.quality = "low";
    store.streamQualities = { s1: "low" };
    store.uploadQuality = "144";
    store.uploadFps = "15";
    store.remoteAudioMuted = { s1: true };
    store.reset();
    expect(store.quality).toBe("auto");
    expect(store.streamQualities).toEqual({});
    expect(store.uploadQuality).toBe("720");
    expect(store.uploadFps).toBe("30");
    expect(store.remoteAudioMuted).toEqual({});
  });
});
