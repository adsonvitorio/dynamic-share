import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomEventHandlers } from "./connection.svelte";

let handlers: RoomEventHandlers | null = null;
const roomMock = {
  room: null as null | {
    remoteParticipants: Map<string, unknown>;
    localParticipant: { sid: string };
  },
  userName: "Nick",
  setHandlers: vi.fn((h: RoomEventHandlers) => {
    handlers = h;
  }),
  connect: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
};
vi.mock("./connection.svelte", () => ({ connectionStore: roomMock }));

const streamsMock = {
  addAvailableStream: vi.fn(),
  removeAvailableStream: vi.fn(),
  updateAvailableStream: vi.fn(),
  setHasAudio: vi.fn(),
  removeHasAudio: vi.fn(),
  addVideoCard: vi.fn(),
  removeVideoCard: vi.fn(),
  addSubscribed: vi.fn(),
  removeSubscribed: vi.fn(),
  announceViewership: vi.fn(),
  updateViewership: vi.fn(),
  removeViewerFromAll: vi.fn(),
  updateViewersAvatar: vi.fn(),
  removeStreamViewers: vi.fn(),
  pruneDisconnected: vi.fn(),
  subscribedSids: new Set<string>(),
  reset: vi.fn(),
};
vi.mock("./streams.svelte", () => ({ streamsStore: streamsMock }));

const sharingMock = { isSharing: false, reset: vi.fn() };
vi.mock("./sharing.svelte", () => ({ sharingStore: sharingMock }));

const qualityMock = {
  quality: "auto",
  uploadQuality: "720",
  uploadFps: "30",
  remoteAudioMuted: {} as Record<string, boolean>,
  setQuality: vi.fn(),
  applyQuality: vi.fn(),
  setRemoteUploadQuality: vi.fn(),
  setRemoteUploadFps: vi.fn(),
  removeRemoteAudio: vi.fn(),
  removeRemoteQuality: vi.fn(),
  pruneDisconnected: vi.fn(),
  reset: vi.fn(),
};
vi.mock("./quality.svelte", () => ({ qualityStore: qualityMock }));

const participantsMock = { update: vi.fn(), reset: vi.fn() };
vi.mock("./participants.svelte", () => ({ participantsStore: participantsMock }));

const attachAudioMock = vi.fn();
const detachAudioMock = vi.fn();
const setAudioMutedMock = vi.fn();
vi.mock("$lib/utils/audio", () => ({
  attachScreenShareAudio: attachAudioMock,
  detachScreenShareAudio: detachAudioMock,
  setAudioMuted: setAudioMutedMock,
  syncVideoElement: vi.fn(),
  cleanupVideoSync: vi.fn(),
}));

const publishDataMock = vi.fn();
vi.mock("$lib/utils/livekit-data", () => ({ publishData: publishDataMock }));

const sounds = {
  event: vi.fn(),
};
vi.mock("$lib/utils/notify-sound", () => ({
  playEventSound: sounds.event,
}));

const notifyMock = vi.fn();
const notifyResetMock = vi.fn();
vi.mock("./notifications.svelte", () => ({
  notifications: { notify: notifyMock, reset: notifyResetMock },
}));

vi.mock("livekit-client", () => ({
  Track: {
    Source: { ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" },
    Kind: { Video: "video" },
  },
  VideoQuality: { HIGH: 2, MEDIUM: 1, LOW: 0 },
}));

function participant(sid: string, opts: { isLocal?: boolean; identity?: string } = {}) {
  return {
    sid,
    isLocal: opts.isLocal ?? false,
    identity: opts.identity ?? `id-${sid}`,
    name: "P",
    metadata: undefined,
  };
}

function pub(source: string, track?: unknown) {
  return { source, kind: "video", track } as never;
}

function trackMsg(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

async function load() {
  vi.resetModules();
  return await import("./room.svelte");
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers = null;
  roomMock.room = null;
  sharingMock.isSharing = false;
  streamsMock.subscribedSids = new Set();
  qualityMock.remoteAudioMuted = {};
});

describe("track handlers", () => {
  it("TrackPublished ScreenShare remoto → stream disponível + toast share_start", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackPublished(pub("screen_share"), p as never);
    expect(streamsMock.addAvailableStream).toHaveBeenCalledWith(p);
    expect(notifyMock).toHaveBeenCalledWith(
      "share_start",
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(sounds.event).not.toHaveBeenCalled();
    expect(participantsMock.update).toHaveBeenCalled();
  });

  it("TrackPublished ScreenShare local não cria stream remota nem toast", async () => {
    const room = await load();
    await room.connectRoom("sala");
    handlers!.onTrackPublished(pub("screen_share"), participant("l", { isLocal: true }) as never);
    expect(streamsMock.addAvailableStream).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("TrackPublished/Unpublished ScreenShareAudio → hasAudio", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackPublished(pub("screen_share_audio"), p as never);
    expect(streamsMock.setHasAudio).toHaveBeenCalledWith("s1", true);
    handlers!.onTrackUnpublished(pub("screen_share_audio"), p as never);
    expect(streamsMock.removeHasAudio).toHaveBeenCalledWith("s1");
  });

  it("TrackUnpublished ScreenShare remoto → remove stream + viewers + toast share_stop", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackUnpublished(pub("screen_share"), p as never);
    expect(streamsMock.removeAvailableStream).toHaveBeenCalledWith(p);
    expect(streamsMock.removeStreamViewers).toHaveBeenCalledWith("s1");
    expect(notifyMock).toHaveBeenCalledWith(
      "share_stop",
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(sounds.event).not.toHaveBeenCalled();
  });

  it("TrackMuted/Unmuted ScreenShareAudio remoto → hasAudio false/true", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackMuted(pub("screen_share_audio"), p as never);
    expect(streamsMock.setHasAudio).toHaveBeenCalledWith("s1", false);
    handlers!.onTrackUnmuted(pub("screen_share_audio"), p as never);
    expect(streamsMock.setHasAudio).toHaveBeenCalledWith("s1", true);
  });

  it("TrackUnmuted ScreenShareAudio remoto repõe o mute local do viewer", async () => {
    const room = await load();
    await room.connectRoom("sala");
    qualityMock.remoteAudioMuted = { s1: true, s2: false };
    handlers!.onTrackUnmuted(pub("screen_share_audio"), participant("s1") as never);
    expect(setAudioMutedMock).toHaveBeenCalledWith("s1", true);
    handlers!.onTrackUnmuted(pub("screen_share_audio"), participant("s3") as never);
    expect(setAudioMutedMock).toHaveBeenCalledWith("s3", false);
  });

  it("TrackMuted de outra source ou local é ignorado", async () => {
    const room = await load();
    await room.connectRoom("sala");
    handlers!.onTrackMuted(pub("screen_share"), participant("s1") as never);
    handlers!.onTrackMuted(
      pub("screen_share_audio"),
      participant("l", { isLocal: true }) as never,
    );
    handlers!.onTrackUnmuted(pub("screen_share"), participant("s1") as never);
    expect(streamsMock.setHasAudio).not.toHaveBeenCalled();
  });

  it("TrackSubscribed ScreenShare → video card + subscribed + aplica quality do sid", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    const track = { source: "screen_share" };
    handlers!.onTrackSubscribed(track as never, pub("screen_share") as never, p as never);
    expect(streamsMock.addVideoCard).toHaveBeenCalledWith(p, track, false);
    expect(streamsMock.addSubscribed).toHaveBeenCalledWith("s1");
    expect(qualityMock.applyQuality).toHaveBeenCalledWith("s1");
  });

  it("TrackSubscribed ScreenShareAudio → attach áudio", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    const track = { source: "screen_share_audio" };
    handlers!.onTrackSubscribed(track as never, pub("screen_share_audio") as never, p as never);
    expect(attachAudioMock).toHaveBeenCalledWith("s1", track);
  });

  it("TrackUnsubscribed ScreenShare → remove card + anuncia leave", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    const track = { source: "screen_share" };
    handlers!.onTrackUnsubscribed(track as never, pub("screen_share") as never, p as never);
    expect(streamsMock.removeVideoCard).toHaveBeenCalledWith(p);
    expect(streamsMock.removeSubscribed).toHaveBeenCalledWith("s1");
    expect(streamsMock.announceViewership).toHaveBeenCalledWith("s1", false);
  });

  it("TrackUnsubscribed ScreenShareAudio → detach áudio", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackUnsubscribed(
      { source: "screen_share_audio" } as never,
      pub("screen_share_audio") as never,
      p as never,
    );
    expect(detachAudioMock).toHaveBeenCalledWith("s1");
  });
});

describe("local track handlers", () => {
  it("LocalTrackPublished ScreenShare → card+stream local + som + republish quality/fps", async () => {
    const room = await load();
    roomMock.room = { remoteParticipants: new Map(), localParticipant: { sid: "l" } };
    await room.connectRoom("sala");
    const p = participant("l", { isLocal: true });
    const track = { source: "screen_share" };
    handlers!.onLocalTrackPublished(pub("screen_share", track), p as never);
    expect(streamsMock.addVideoCard).toHaveBeenCalledWith(p, track, true);
    expect(streamsMock.addAvailableStream).toHaveBeenCalledWith(p, true);
    expect(sounds.event).toHaveBeenCalledWith("shareStart");
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-quality",
      quality: "720",
    });
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-fps",
      fps: "30",
    });
  });

  it("LocalTrackUnpublished ScreenShare → cleanup + sharing reset", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("l", { isLocal: true });
    handlers!.onLocalTrackUnpublished(pub("screen_share"), p as never);
    expect(streamsMock.removeVideoCard).toHaveBeenCalledWith(p);
    expect(streamsMock.removeAvailableStream).toHaveBeenCalledWith(p);
    expect(sharingMock.reset).toHaveBeenCalled();
    expect(sounds.event).toHaveBeenCalledWith("shareStop");
  });
});

describe("participant handlers", () => {
  it("ParticipantConnected → update + som + re-announce dos subscritos", async () => {
    const room = await load();
    roomMock.room = { remoteParticipants: new Map(), localParticipant: { sid: "l" } };
    await room.connectRoom("sala");
    streamsMock.subscribedSids = new Set(["s1", "s2"]);
    sharingMock.isSharing = true;
    const p = participant("s9", { identity: "id-s9" });
    handlers!.onParticipantConnected(p as never);
    expect(participantsMock.update).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      "room_join",
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(streamsMock.announceViewership).toHaveBeenCalledWith("s1", true);
    expect(streamsMock.announceViewership).toHaveBeenCalledWith("s2", true);
    expect(publishDataMock).toHaveBeenCalledWith(roomMock.room, {
      type: "upload-quality",
      quality: "720",
    });
  });

  it("ParticipantDisconnected → cleanup completo + varredura de sids mortos", async () => {
    const room = await load();
    roomMock.room = {
      remoteParticipants: new Map(),
      localParticipant: { sid: "l" },
    };
    await room.connectRoom("sala");
    const p = participant("s1", { identity: "id-s1" });
    handlers!.onParticipantDisconnected(p as never);
    expect(notifyMock).toHaveBeenCalledWith(
      "room_leave",
      expect.objectContaining({ name: expect.any(String) }),
    );
    expect(streamsMock.removeViewerFromAll).toHaveBeenCalledWith("id-s1");
    expect(streamsMock.removeVideoCard).toHaveBeenCalledWith(p);
    expect(qualityMock.removeRemoteAudio).toHaveBeenCalledWith("s1");
    expect(qualityMock.removeRemoteQuality).toHaveBeenCalledWith("s1");
    expect(detachAudioMock).toHaveBeenCalledWith("s1");
    // Kick por duplicate-identity: o SDK muta o sid do objeto do
    // participante — o evento chega com o sid da sessão NOVA e a remoção
    // por sid erra a sessão morta. A varredura por sids vivos cobre.
    expect(streamsMock.pruneDisconnected).toHaveBeenCalledWith(new Set(["l"]));
    expect(qualityMock.pruneDisconnected).toHaveBeenCalledWith(new Set(["l"]));
  });

  it("TrackUnpublished/Unsubscribed também varrem sids mortos", async () => {
    const room = await load();
    roomMock.room = {
      remoteParticipants: new Map([
        ["s2", { ...participant("s2"), trackPublications: new Map() }],
      ]),
      localParticipant: { sid: "l" },
    };
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackUnpublished(pub("screen_share"), p as never);
    expect(streamsMock.pruneDisconnected).toHaveBeenCalledWith(new Set(["l", "s2"]));
    handlers!.onTrackUnsubscribed(
      { source: "screen_share" } as never,
      pub("screen_share") as never,
      p as never,
    );
    expect(streamsMock.pruneDisconnected).toHaveBeenCalledTimes(2);
  });

  it("ParticipantMetadataChanged → update + avatar sync", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onParticipantMetadataChanged(p as never);
    expect(participantsMock.update).toHaveBeenCalled();
    expect(streamsMock.updateAvailableStream).toHaveBeenCalledWith(p);
    expect(streamsMock.updateViewersAvatar).toHaveBeenCalledWith(p);
  });
});

describe("data channel", () => {
  it("ignora payload sem participant ou JSON inválido", async () => {
    const room = await load();
    await room.connectRoom("sala");
    handlers!.onDataReceived(trackMsg({ type: "viewership" }), undefined);
    handlers!.onDataReceived(new TextEncoder().encode("not json"), participant("s1") as never);
    expect(streamsMock.updateViewership).not.toHaveBeenCalled();
  });

  it("ignora mensagem sem type ou com valores fora do set", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onDataReceived(trackMsg({ foo: 1 }), p as never);
    handlers!.onDataReceived(trackMsg({ type: "upload-quality", quality: "999" }), p as never);
    handlers!.onDataReceived(trackMsg({ type: "upload-fps", fps: "60" }), p as never);
    expect(qualityMock.setRemoteUploadQuality).not.toHaveBeenCalled();
    expect(qualityMock.setRemoteUploadFps).not.toHaveBeenCalled();
  });

  it("upload-quality/fps válidos → qualityStore", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onDataReceived(trackMsg({ type: "upload-quality", quality: "480" }), p as never);
    handlers!.onDataReceived(trackMsg({ type: "upload-fps", fps: "15" }), p as never);
    expect(qualityMock.setRemoteUploadQuality).toHaveBeenCalledWith("s1", "480");
    expect(qualityMock.setRemoteUploadFps).toHaveBeenCalledWith("s1", "15");
  });

  it("viewership válido → streamsStore (sem campos de identidade do payload)", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onDataReceived(
      trackMsg({
        type: "viewership",
        streamSid: "s1",
        watching: true,
        name: "Nome-Forjado",
        identity: "id-vitima",
      }),
      p as never,
    );
    // O handler nunca repassa name/identity do payload — quem exibe
    // resolve pelo participant (JWT assinado pelo server).
    expect(streamsMock.updateViewership).toHaveBeenCalledWith(p, "s1", true);
  });

  it("viewership sem participant → descarta (remetente não verificável)", async () => {
    const room = await load();
    await room.connectRoom("sala");
    // Pacote chega antes do join — sem participant o SDK não prova o
    // remetente, então identity/name do payload não podem ser aceitos.
    // A race real é coberta pelo re-anúncio em onTrackSubscribed.
    handlers!.onDataReceived(
      trackMsg({
        type: "viewership",
        streamSid: "s1",
        watching: true,
        name: "Ana",
        identity: "id-v1",
      }),
      undefined,
    );
    handlers!.onParticipantConnected(participant("v1") as never);
    expect(streamsMock.updateViewership).not.toHaveBeenCalled();
  });

  it("TrackSubscribed re-anuncia viewership (cobre a race join×data)", async () => {
    const room = await load();
    await room.connectRoom("sala");
    const p = participant("s1");
    handlers!.onTrackSubscribed(
      { source: "screen_share" } as never,
      pub("screen_share") as never,
      p as never,
    );
    expect(streamsMock.announceViewership).toHaveBeenCalledWith("s1", true);
  });
});

describe("connectRoom reconcile + destroyRoom", () => {
  it("após connect enumera remoteParticipants (streams + áudio)", async () => {
    const remote = {
      ...participant("s1"),
      trackPublications: new Map([
        ["v", pub("screen_share")],
        ["a", pub("screen_share_audio")],
      ]),
    };
    roomMock.connect.mockImplementation(async () => {
      roomMock.room = {
        remoteParticipants: new Map([["s1", remote]]),
        localParticipant: { sid: "l" },
      };
    });
    const room = await load();
    await room.connectRoom("sala");
    expect(streamsMock.addAvailableStream).toHaveBeenCalledWith(remote);
    expect(streamsMock.setHasAudio).toHaveBeenCalledWith("s1", true);
    expect(participantsMock.update).toHaveBeenCalled();
  });

  it("onTerminated (kick/disconnect do server) → reseta os stores da sala", async () => {
    const room = await load();
    await room.connectRoom("sala");
    handlers!.onTerminated?.();
    // Kick por duplicate-identity não emite LocalTrackUnpublished — sem
    // o reset o card de share e o isSharing ficavam congelados na stage.
    expect(streamsMock.reset).toHaveBeenCalled();
    expect(sharingMock.reset).toHaveBeenCalled();
    expect(participantsMock.reset).toHaveBeenCalled();
    expect(qualityMock.reset).toHaveBeenCalled();
    expect(notifyResetMock).toHaveBeenCalled();
  });

  it("destroyRoom → destroy + resets", async () => {
    const room = await load();
    await room.destroyRoom();
    expect(roomMock.destroy).toHaveBeenCalled();
    expect(streamsMock.reset).toHaveBeenCalled();
    expect(participantsMock.reset).toHaveBeenCalled();
    expect(qualityMock.reset).toHaveBeenCalled();
    expect(sharingMock.reset).toHaveBeenCalled();
    expect(notifyResetMock).toHaveBeenCalled();
  });
});
