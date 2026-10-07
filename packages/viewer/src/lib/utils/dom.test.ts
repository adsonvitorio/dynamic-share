import { beforeEach, describe, expect, it, vi } from "vitest";
import { exitFullscreen, exitPiP, exitPiPIfRemoved, toggleFullscreen, togglePiP } from "./dom";

class FakeVideoElement {
  requestPictureInPicture = vi.fn().mockResolvedValue(undefined);
}

const elements = new Map<string, Element>();
const documentStub = {
  fullscreenElement: null as Element | null,
  pictureInPictureElement: null as Element | null,
  exitFullscreen: vi.fn().mockResolvedValue(undefined),
  exitPictureInPicture: vi.fn().mockResolvedValue(undefined),
  getElementById: (id: string) => elements.get(id) ?? null,
  body: { contains: (el: unknown) => el !== null && [...elements.values()].includes(el as Element) },
};

vi.stubGlobal("document", documentStub);
vi.stubGlobal("HTMLVideoElement", FakeVideoElement);

beforeEach(() => {
  elements.clear();
  documentStub.fullscreenElement = null;
  documentStub.pictureInPictureElement = null;
  vi.clearAllMocks();
});

describe("toggleFullscreen", () => {
  it("entra em fullscreen quando nenhum ativo", () => {
    const el = { requestFullscreen: vi.fn().mockResolvedValue(undefined) } as unknown as Element;
    elements.set("card-1", el);
    toggleFullscreen("card-1");
    expect(el.requestFullscreen).toHaveBeenCalled();
    expect(documentStub.exitFullscreen).not.toHaveBeenCalled();
  });

  it("sai de fullscreen quando já ativo", () => {
    elements.set("card-1", {} as Element);
    documentStub.fullscreenElement = {} as Element;
    toggleFullscreen("card-1");
    expect(documentStub.exitFullscreen).toHaveBeenCalled();
  });
});

describe("exitFullscreen", () => {
  it("sai apenas quando há fullscreen ativo", () => {
    exitFullscreen();
    expect(documentStub.exitFullscreen).not.toHaveBeenCalled();
    documentStub.fullscreenElement = {} as Element;
    exitFullscreen();
    expect(documentStub.exitFullscreen).toHaveBeenCalled();
  });
});

describe("PiP", () => {
  it("togglePiP entra quando inativo e sai quando ativo", async () => {
    const video = new FakeVideoElement();
    elements.set("video-s1", video as unknown as Element);
    await togglePiP("video-s1");
    expect(video.requestPictureInPicture).toHaveBeenCalled();

    documentStub.pictureInPictureElement = video as unknown as Element;
    await togglePiP("video-s1");
    expect(documentStub.exitPictureInPicture).toHaveBeenCalled();
  });

  it("exitPiP sai apenas quando há PiP ativo", () => {
    exitPiP();
    expect(documentStub.exitPictureInPicture).not.toHaveBeenCalled();
    documentStub.pictureInPictureElement = {} as Element;
    exitPiP();
    expect(documentStub.exitPictureInPicture).toHaveBeenCalled();
  });

  it("exitPiPIfRemoved sai só quando o elemento saiu do DOM", () => {
    const inDom = {} as Element;
    elements.set("keep", inDom);
    documentStub.pictureInPictureElement = inDom;
    exitPiPIfRemoved();
    expect(documentStub.exitPictureInPicture).not.toHaveBeenCalled();

    const removed = {} as Element;
    documentStub.pictureInPictureElement = removed;
    exitPiPIfRemoved();
    expect(documentStub.exitPictureInPicture).toHaveBeenCalled();
  });
});
