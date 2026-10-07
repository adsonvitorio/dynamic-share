import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteTrack } from "livekit-client";
import {
  attachScreenShareAudio,
  detachAllAudio,
  detachScreenShareAudio,
  onPiPVolumeChange,
  setAudioMuted,
  setAudioState,
  setAudioVolume,
  syncVideoElement,
  withVideoSyncSuppressed,
} from "./audio";

class FakeAudioElement {
  id = "";
  autoplay = false;
  muted = false;
  volume = 1;
  style: Record<string, string> = {};
  removed = false;
  play = vi.fn().mockResolvedValue(undefined);
  remove(): void {
    this.removed = true;
  }
}

class FakeVideoElement {
  muted = false;
  volume = 1;
  private listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, fn: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  emitVolume(): void {
    for (const fn of this.listeners.get("volumechange") ?? []) fn();
  }
}

const elements = new Map<string, object>();
const appended: object[] = [];

vi.stubGlobal("document", {
  getElementById: (id: string) => elements.get(id) ?? null,
  createElement: () => new FakeAudioElement(),
  body: {
    appendChild: (el: object) => {
      appended.push(el);
      const id = (el as { id?: string }).id;
      if (id) elements.set(id, el);
    },
  },
});
vi.stubGlobal("HTMLAudioElement", FakeAudioElement);
vi.stubGlobal("HTMLVideoElement", FakeVideoElement);

function track(): RemoteTrack {
  return { attach: vi.fn(), detach: vi.fn() } as unknown as RemoteTrack;
}

function seedEls(sid: string) {
  const audio = new FakeAudioElement();
  audio.id = `audio-${sid}`;
  const video = new FakeVideoElement();
  elements.set(`audio-${sid}`, audio);
  elements.set(`video-${sid}`, video);
  return { audio, video };
}

beforeEach(() => {
  elements.clear();
  appended.length = 0;
  detachAllAudio();
  vi.clearAllMocks();
});

describe("attachScreenShareAudio", () => {
  it("cria <audio> oculto com autoplay e anexa a track", () => {
    const t = track();
    attachScreenShareAudio("s1", t);
    expect(appended).toHaveLength(1);
    const el = appended[0] as FakeAudioElement;
    expect(el.id).toBe("audio-s1");
    expect(el.autoplay).toBe(true);
    expect(el.style.display).toBe("none");
    expect(t.attach).toHaveBeenCalledWith(el);
    expect(el.play).toHaveBeenCalled();
  });

  it("aplica muted/volume vigentes do estado", () => {
    setAudioState({ s1: true }, { s1: 0.3 });
    const t = track();
    attachScreenShareAudio("s1", t);
    const el = appended[0] as FakeAudioElement;
    expect(el.muted).toBe(true);
    expect(el.volume).toBe(0.3);
  });

  it("preserva muted do estado mesmo quando attach do SDK força muted=false", () => {
    setAudioState({ s1: true }, {});
    // attachToElement do SDK escreve el.muted = !hasAudioTracks no attach.
    const t = {
      attach: vi.fn((el: FakeAudioElement) => {
        el.muted = false;
      }),
      detach: vi.fn(),
    } as unknown as RemoteTrack;
    attachScreenShareAudio("s1", t);
    const el = appended[0] as FakeAudioElement;
    expect(el.muted).toBe(true);
  });

  it("reanexar no mesmo sid detacha a track anterior", () => {
    const first = track();
    attachScreenShareAudio("s1", first);
    const second = track();
    attachScreenShareAudio("s1", second);
    expect(first.detach).toHaveBeenCalled();
    expect(second.attach).toHaveBeenCalled();
  });
});

describe("sync + PiP callback", () => {
  it("syncVideoElement espelha volume do áudio no vídeo e registra volumechange", () => {
    const { audio, video } = seedEls("s1");
    audio.muted = true;
    audio.volume = 0.4;
    syncVideoElement("s1");
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.4);

    const cb = vi.fn();
    onPiPVolumeChange(cb);
    video.muted = false;
    video.volume = 0.8;
    video.emitVolume();
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(0.8);
    expect(cb).toHaveBeenCalledWith("s1", false, 0.8);
  });

  it("writes suprimidos (attach do SDK, sync interno) não ecoam para o callback", () => {
    const { audio, video } = seedEls("s1");
    audio.muted = false;
    audio.volume = 0.6;
    syncVideoElement("s1");

    const cb = vi.fn();
    onPiPVolumeChange(cb);
    withVideoSyncSuppressed("s1", () => {
      video.muted = true;
      video.emitVolume();
    });
    expect(cb).not.toHaveBeenCalled();
    expect(audio.muted).toBe(false);
  });

  it("setAudioMuted/setAudioVolume no vídeo não ecoam para o callback", () => {
    const { video } = seedEls("s1");
    syncVideoElement("s1");
    const cb = vi.fn();
    onPiPVolumeChange(cb);
    setAudioMuted("s1", true);
    setAudioVolume("s1", 0.2);
    expect(cb).not.toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.2);
  });
});

describe("detach", () => {
  it("detachScreenShareAudio detacha track e remove elemento", () => {
    const t = track();
    attachScreenShareAudio("s1", t);
    const el = appended[0] as FakeAudioElement;
    detachScreenShareAudio("s1");
    expect(t.detach).toHaveBeenCalledWith(el);
    expect(el.removed).toBe(true);
  });

  it("detachAllAudio limpa todas as tracks e listeners", () => {
    const a = track();
    const b = track();
    attachScreenShareAudio("s1", a);
    attachScreenShareAudio("s2", b);
    detachAllAudio();
    expect(a.detach).toHaveBeenCalled();
    expect(b.detach).toHaveBeenCalled();
  });
});

describe("setAudioMuted/setAudioVolume", () => {
  it("aplica em audio+video e clampa volume [0,1]", () => {
    const { audio, video } = seedEls("s1");
    setAudioMuted("s1", true);
    expect(audio.muted).toBe(true);
    expect(video.muted).toBe(true);

    setAudioVolume("s1", 5);
    expect(audio.volume).toBe(1);
    expect(video.volume).toBe(1);
    setAudioVolume("s1", -3);
    expect(audio.volume).toBe(0);
  });
});
