import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  controlBarModel,
  leaveRoom,
  switchScreen,
  toggleShare,
  unwatchStream,
} from "./controlbar";
import controlBarSrc from "./ControlBar.svelte?raw";
import roomStageSrc from "./RoomStage.svelte?raw";
import { ROUTES } from "$lib/constants";

const mocks = vi.hoisted(() => {
  const shareScreen = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const stopShare = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const switchScreenMock = vi.fn<() => Promise<void>>(() => Promise.resolve());
  return {
    goto: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    destroyRoom: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    sharingStore: { isSharing: false, shareScreen, stopShare, switchScreen: switchScreenMock },
    streamsStore: { toggleSubscribe: vi.fn<() => Promise<void>>(() => Promise.resolve()) },
  };
});
vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("$lib/room/room.svelte", () => ({
  destroyRoom: mocks.destroyRoom,
  sharingStore: mocks.sharingStore,
  streamsStore: mocks.streamsStore,
}));
const sharingStoreMock = mocks.sharingStore;
const streamsStoreMock = mocks.streamsStore;
const destroyRoomMock = mocks.destroyRoom;
const shareScreenMock = mocks.sharingStore.shareScreen;
const stopShareMock = mocks.sharingStore.stopShare;
const switchScreenMock = mocks.sharingStore.switchScreen;
const gotoMock = mocks.goto;

describe("controlBarModel", () => {
  it("fps só aparece quando o usuário local está compartilhando", () => {
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: false }).showFps,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: true, focused: undefined, focusedWatched: false, hasAudio: false }).showFps,
    ).toBe(true);
  });

  it("controle de áudio segue o stream focado quando ele tem faixa de áudio", () => {
    const model = controlBarModel({
      isSharing: false,
      focused: { participantSid: "p1", isLocal: false },
      focusedWatched: true,
      hasAudio: true,
    });
    expect(model.audioSid).toBe("p1");
    expect(model.audioIsLocal).toBe(false);
  });

  it("stream focado local mantém isLocal no controle de áudio", () => {
    const model = controlBarModel({
      isSharing: true,
      focused: { participantSid: "me", isLocal: true },
      focusedWatched: true,
      hasAudio: true,
    });
    expect(model.audioSid).toBe("me");
    expect(model.audioIsLocal).toBe(true);
  });

  it("switchScreen só aparece para o apresentador local", () => {
    expect(
      controlBarModel({ isSharing: true, focused: undefined, focusedWatched: false, hasAudio: false }).showSwitchScreen,
    ).toBe(true);
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: false }).showSwitchScreen,
    ).toBe(false);
  });

  it("sem faixa de áudio ou sem foco, não há controle de áudio", () => {
    expect(
      controlBarModel({
        isSharing: false,
        focused: { participantSid: "p1", isLocal: false },
        focusedWatched: true,
        hasAudio: false,
      }).audioSid,
    ).toBeNull();
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: true }).audioSid,
    ).toBeNull();
  });

  it("hint de áudio indisponível: compartilhando + foco local + sem faixa de áudio", () => {
    const local = { participantSid: "me", isLocal: true };
    const remote = { participantSid: "p1", isLocal: false };
    expect(
      controlBarModel({ isSharing: true, focused: local, focusedWatched: true, hasAudio: false }).showAudioUnavailable,
    ).toBe(true);
    expect(
      controlBarModel({ isSharing: true, focused: local, focusedWatched: true, hasAudio: true }).showAudioUnavailable,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: false, focused: local, focusedWatched: true, hasAudio: false }).showAudioUnavailable,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: true, focused: remote, focusedWatched: true, hasAudio: false }).showAudioUnavailable,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: true, focused: undefined, focusedWatched: false, hasAudio: false }).showAudioUnavailable,
    ).toBe(false);
  });

  it("upload quality só aparece quando o usuário está compartilhando", () => {
    expect(
      controlBarModel({ isSharing: true, focused: undefined, focusedWatched: false, hasAudio: false }).showUploadQuality,
    ).toBe(true);
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: false }).showUploadQuality,
    ).toBe(false);
  });

  it("unwatch só para stream focada remota e assistida", () => {
    const remote = { participantSid: "p1", isLocal: false };
    expect(
      controlBarModel({ isSharing: false, focused: remote, focusedWatched: true, hasAudio: false }).showUnwatch,
    ).toBe(true);
    expect(
      controlBarModel({ isSharing: false, focused: remote, focusedWatched: false, hasAudio: false }).showUnwatch,
    ).toBe(false);
    expect(
      controlBarModel({
        isSharing: false,
        focused: { participantSid: "me", isLocal: true },
        focusedWatched: true,
        hasAudio: false,
      }).showUnwatch,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: false }).showUnwatch,
    ).toBe(false);
  });

  it("view actions (fs/pip) só com stream focada assistida", () => {
    const remote = { participantSid: "p1", isLocal: false };
    expect(
      controlBarModel({ isSharing: false, focused: remote, focusedWatched: true, hasAudio: false }).showViewActions,
    ).toBe(true);
    expect(
      controlBarModel({ isSharing: false, focused: remote, focusedWatched: false, hasAudio: false }).showViewActions,
    ).toBe(false);
    expect(
      controlBarModel({ isSharing: false, focused: undefined, focusedWatched: false, hasAudio: false }).showViewActions,
    ).toBe(false);
  });
});

describe("toggleShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharingStoreMock.isSharing = false;
  });

  it("inicia compartilhamento quando não está compartilhando", async () => {
    await toggleShare();
    expect(shareScreenMock).toHaveBeenCalledTimes(1);
    expect(stopShareMock).not.toHaveBeenCalled();
  });

  it("para compartilhamento quando está compartilhando", async () => {
    sharingStoreMock.isSharing = true;
    await toggleShare();
    expect(stopShareMock).toHaveBeenCalledTimes(1);
    expect(shareScreenMock).not.toHaveBeenCalled();
  });
});

describe("leaveRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("destrói a conexão da sala e navega para o hub", async () => {
    await leaveRoom();
    expect(destroyRoomMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith(ROUTES.ROOMS);
  });

  it("destrói antes de navegar", async () => {
    const order: string[] = [];
    destroyRoomMock.mockImplementationOnce(async () => {
      order.push("destroy");
    });
    gotoMock.mockImplementationOnce(async () => {
      order.push("goto");
    });
    await leaveRoom();
    expect(order).toEqual(["destroy", "goto"]);
  });
});

describe("switchScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega para sharingStore.switchScreen", async () => {
    await switchScreen();
    expect(switchScreenMock).toHaveBeenCalledTimes(1);
  });
});

describe("unwatchStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega para streamsStore.toggleSubscribe", async () => {
    await unwatchStream("p1");
    expect(streamsStoreMock.toggleSubscribe).toHaveBeenCalledWith("p1");
  });
});

describe("layout da ControlBar", () => {
  it("barra vive no fluxo (faixa dedicada) — nunca overlay absolute", () => {
    expect(controlBarSrc).not.toMatch(/\babsolute\b/);
    expect(controlBarSrc).toContain("shrink-0");
  });

  it("RoomStage renderiza a ControlBar abaixo do stage", () => {
    expect(roomStageSrc).toContain("<ControlBar");
    expect(roomStageSrc).toContain("focusedSid");
  });

  it("botão de share reflete pending: disabled + aria-busy + label", () => {
    expect(controlBarSrc).toContain("disabled={sharingStore.starting}");
    expect(controlBarSrc).toContain("aria-busy={sharingStore.starting}");
    expect(controlBarSrc).toContain("copy.shareStarting");
  });

  it("hint de áudio indisponível usa aria-disabled (não disabled) + tooltip explicativo", () => {
    expect(controlBarSrc).toContain("model.showAudioUnavailable");
    expect(controlBarSrc).toContain('aria-disabled="true"');
    expect(controlBarSrc).toContain("title={copy.shareAudioUnavailable}");
    expect(controlBarSrc).toContain("aria-label={copy.shareAudioUnavailable}");
  });
});
