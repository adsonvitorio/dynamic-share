import { beforeEach, describe, expect, it, vi } from "vitest";

const roomMock: {
  room: null | { localParticipant: FakeLocalParticipant };
  error: string;
} = { room: null, error: "" };

vi.mock("./connection.svelte", () => ({ connectionStore: roomMock }));

const qualityMock = { uploadQuality: "720", uploadFps: "30" };
vi.mock("./quality.svelte", () => ({ qualityStore: qualityMock }));

const resumeAudioMock = vi.fn();
vi.mock("$lib/utils/notify-sound", () => ({ resumeAudio: resumeAudioMock }));

const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock("$lib/utils/logger", () => ({ createLogger: () => loggerMock }));

class FakeMediaTrack {
  stop = vi.fn();
  applyConstraints = vi.fn().mockResolvedValue(undefined);
}
class FakeLocalTrack {
  constructor(public mediaStreamTrack: FakeMediaTrack) {}
  replaceTrack = vi.fn().mockResolvedValue(undefined);
  mute = vi.fn().mockResolvedValue(undefined);
  unmute = vi.fn().mockResolvedValue(undefined);
  stop = vi.fn();
}
class FakeLocalVideoTrack extends FakeLocalTrack {}
class FakeLocalAudioTrack extends FakeLocalTrack {}

class FakePublication {
  constructor(public track: FakeLocalTrack | null) {}
}

class FakeLocalParticipant {
  publications = new Map<string, FakePublication>();
  setScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
  getTrackPublication = (source: string) => this.publications.get(source);
  unpublishTrack = vi.fn().mockResolvedValue(undefined);
  publishTrack = vi.fn().mockResolvedValue(undefined);
}

vi.mock("livekit-client", () => ({
  Track: { Source: { ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" } },
  LocalTrack: FakeLocalTrack,
  LocalVideoTrack: FakeLocalVideoTrack,
  LocalAudioTrack: FakeLocalAudioTrack,
  VideoQuality: { HIGH: 2, MEDIUM: 1, LOW: 0 },
}));

const getDisplayMediaMock = vi.fn();
vi.stubGlobal("navigator", {
  mediaDevices: { getDisplayMedia: getDisplayMediaMock },
});

async function loadStore() {
  vi.resetModules();
  const mod = await import("./sharing.svelte");
  return mod.sharingStore;
}

function setRoom() {
  const lp = new FakeLocalParticipant();
  roomMock.room = { localParticipant: lp };
  return lp;
}

function streamOf(video: FakeMediaTrack[], audio: FakeMediaTrack[] = []) {
  const tracks = [...video, ...audio];
  return {
    getVideoTracks: () => video,
    getAudioTracks: () => audio,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

function notAllowed() {
  return Object.assign(new Error("denied"), { name: "NotAllowedError" });
}

beforeEach(() => {
  vi.clearAllMocks();
  roomMock.room = null;
  roomMock.error = "";
  qualityMock.uploadQuality = "720";
  qualityMock.uploadFps = "30";
});

describe("shareScreen", () => {
  it("habilita screen share sem processamento de áudio e aplica constraints", async () => {
    const store = await loadStore();
    const lp = setRoom();
    const media = new FakeMediaTrack();
    lp.setScreenShareEnabled.mockImplementation(async () => {
      lp.publications.set("screen_share", new FakePublication(new FakeLocalVideoTrack(media)));
    });
    await store.shareScreen();
    expect(lp.setScreenShareEnabled).toHaveBeenCalledWith(true, {
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: true,
    });
    expect(media.applyConstraints).toHaveBeenCalledWith(
      expect.objectContaining({ width: { ideal: 1280, max: 1280 } }),
    );
    expect(media.applyConstraints).toHaveBeenCalledWith({ frameRate: 30 });
    expect(store.isSharing).toBe(true);
  });

  it("NotAllowedError é silencioso (sem error no connectionStore)", async () => {
    const store = await loadStore();
    const lp = setRoom();
    lp.setScreenShareEnabled.mockRejectedValue(notAllowed());
    await store.shareScreen();
    expect(store.isSharing).toBe(false);
    expect(roomMock.error).toBe("");
  });

  it("erro genérico expõe mensagem", async () => {
    const store = await loadStore();
    const lp = setRoom();
    lp.setScreenShareEnabled.mockRejectedValue(new Error("device fail"));
    await store.shareScreen();
    expect(roomMock.error).toBe("Erro ao compartilhar tela");
  });

  it("share sem ScreenShareAudio publicado loga share_audio_absent (warn)", async () => {
    const store = await loadStore();
    const lp = setRoom();
    lp.setScreenShareEnabled.mockImplementation(async () => {
      lp.publications.set("screen_share", new FakePublication(new FakeLocalVideoTrack(new FakeMediaTrack())));
    });
    await store.shareScreen();
    expect(loggerMock.warn).toHaveBeenCalledWith("share_audio_absent");
    expect(store.isSharing).toBe(true);
  });

  it("share com ScreenShareAudio não loga share_audio_absent", async () => {
    const store = await loadStore();
    const lp = setRoom();
    lp.setScreenShareEnabled.mockImplementation(async () => {
      lp.publications.set("screen_share", new FakePublication(new FakeLocalVideoTrack(new FakeMediaTrack())));
      lp.publications.set("screen_share_audio", new FakePublication(new FakeLocalAudioTrack(new FakeMediaTrack())));
    });
    await store.shareScreen();
    expect(loggerMock.warn).not.toHaveBeenCalledWith("share_audio_absent");
  });

  it("não compartilha sem room ou quando já compartilhando", async () => {
    const store = await loadStore();
    await store.shareScreen();
    expect(resumeAudioMock).not.toHaveBeenCalled();
    const lp = setRoom();
    store.isSharing = true;
    await store.shareScreen();
    expect(lp.setScreenShareEnabled).not.toHaveBeenCalled();
  });

  it("bloqueia reentrada enquanto starting e limpa a flag ao resolver", async () => {
    const store = await loadStore();
    const lp = setRoom();
    let release: () => void;
    lp.setScreenShareEnabled.mockReturnValue(new Promise<void>((r) => (release = r)));
    const p1 = store.shareScreen();
    expect(store.starting).toBe(true);
    await store.shareScreen();
    release!();
    await p1;
    expect(lp.setScreenShareEnabled).toHaveBeenCalledTimes(1);
    expect(store.starting).toBe(false);
  });

  it("starting limpa em erro e bloqueia stopShare concorrente", async () => {
    const store = await loadStore();
    const lp = setRoom();
    let reject: (e: Error) => void;
    lp.setScreenShareEnabled.mockReturnValue(
      new Promise<void>((_, r) => (reject = r)),
    );
    const p = store.shareScreen();
    await store.stopShare();
    expect(lp.setScreenShareEnabled).toHaveBeenCalledTimes(1);
    reject!(new Error("fail"));
    await p;
    expect(store.starting).toBe(false);
    expect(roomMock.error).toBe("Erro ao compartilhar tela");
  });
});

describe("stopShare / toggleLocalAudio", () => {
  it("stopShare desabilita e limpa flags", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    store.localAudioMuted = true;
    await store.stopShare();
    expect(lp.setScreenShareEnabled).toHaveBeenCalledWith(false);
    expect(store.isSharing).toBe(false);
    expect(store.localAudioMuted).toBe(false);
  });

  it("toggleLocalAudio alterna mute na LocalAudioTrack", async () => {
    const store = await loadStore();
    const lp = setRoom();
    const track = new FakeLocalAudioTrack(new FakeMediaTrack());
    lp.publications.set("screen_share_audio", new FakePublication(track));
    await store.toggleLocalAudio();
    expect(track.mute).toHaveBeenCalled();
    expect(store.localAudioMuted).toBe(true);
    await store.toggleLocalAudio();
    expect(track.unmute).toHaveBeenCalled();
    expect(store.localAudioMuted).toBe(false);
  });
});

describe("switchScreen", () => {
  function setupSharing(lp: FakeLocalParticipant, withAudio = true) {
    const oldVideo = new FakeMediaTrack();
    const videoTrack = new FakeLocalVideoTrack(oldVideo);
    lp.publications.set("screen_share", new FakePublication(videoTrack));
    let oldAudio: FakeMediaTrack | null = null;
    if (withAudio) {
      oldAudio = new FakeMediaTrack();
      lp.publications.set(
        "screen_share_audio",
        new FakePublication(new FakeLocalAudioTrack(oldAudio)),
      );
    }
    return { videoTrack, oldVideo, oldAudio };
  }

  it("troca vídeo e áudio via replaceTrack e para tracks antigas", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    const { videoTrack, oldVideo, oldAudio } = setupSharing(lp);
    const newVideo = new FakeMediaTrack();
    const newAudio = new FakeMediaTrack();
    getDisplayMediaMock.mockResolvedValue(streamOf([newVideo], [newAudio]));
    const audioTrack = lp.publications.get("screen_share_audio")!.track!;

    await store.switchScreen();

    expect(videoTrack.replaceTrack).toHaveBeenCalledWith(newVideo);
    expect(oldVideo.stop).toHaveBeenCalled();
    expect(audioTrack.replaceTrack).toHaveBeenCalledWith(newAudio);
    expect(oldAudio!.stop).toHaveBeenCalled();
    expect(newVideo.applyConstraints).toHaveBeenCalled();
    expect(store.switching).toBe(false);
  });

  it("sem áudio novo despublica a track de áudio existente", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    setupSharing(lp);
    getDisplayMediaMock.mockResolvedValue(streamOf([new FakeMediaTrack()]));
    await store.switchScreen();
    expect(lp.unpublishTrack).toHaveBeenCalled();
  });

  it("áudio novo sem publicação existente publica como ScreenShareAudio", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    setupSharing(lp, false);
    const newAudio = new FakeMediaTrack();
    getDisplayMediaMock.mockResolvedValue(streamOf([new FakeMediaTrack()], [newAudio]));
    await store.switchScreen();
    expect(lp.publishTrack).toHaveBeenCalledWith(newAudio, {
      source: "screen_share_audio",
    });
  });

  it("falha após getDisplayMedia para tracks novas não-attachadas", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    const { videoTrack } = setupSharing(lp);
    videoTrack.replaceTrack.mockRejectedValue(new Error("replace fail"));
    const newVideo = new FakeMediaTrack();
    const newAudio = new FakeMediaTrack();
    getDisplayMediaMock.mockResolvedValue(streamOf([newVideo], [newAudio]));
    await store.switchScreen();
    expect(newVideo.stop).toHaveBeenCalled();
    expect(newAudio.stop).toHaveBeenCalled();
    expect(roomMock.error).toBe("Erro ao trocar tela");
    expect(store.switching).toBe(false);
  });

  it("NotAllowedError limpa tracks novas sem expor erro", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    const { videoTrack } = setupSharing(lp);
    videoTrack.replaceTrack.mockRejectedValue(notAllowed());
    const newVideo = new FakeMediaTrack();
    getDisplayMediaMock.mockResolvedValue(streamOf([newVideo]));
    await store.switchScreen();
    expect(newVideo.stop).toHaveBeenCalled();
    expect(roomMock.error).toBe("");
    expect(store.switching).toBe(false);
  });

  it("reentrada bloqueada enquanto switching", async () => {
    const store = await loadStore();
    const lp = setRoom();
    store.isSharing = true;
    setupSharing(lp);
    let release: (v: MediaStream) => void;
    getDisplayMediaMock.mockReturnValue(
      new Promise((r) => (release = r)),
    );
    const p1 = store.switchScreen();
    const p2 = store.switchScreen();
    release!(streamOf([new FakeMediaTrack()]));
    await Promise.all([p1, p2]);
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
  });
});

describe("reset", () => {
  it("limpa todas as flags", async () => {
    const store = await loadStore();
    store.isSharing = true;
    store.localAudioMuted = true;
    store.switching = true;
    store.starting = true;
    store.reset();
    expect(store.isSharing).toBe(false);
    expect(store.localAudioMuted).toBe(false);
    expect(store.switching).toBe(false);
    expect(store.starting).toBe(false);
  });
});
