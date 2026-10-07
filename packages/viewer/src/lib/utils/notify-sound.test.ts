import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOUND, type SoundEvent } from "$lib/constants";
import {
  destroyNotifySound,
  initNotifySound,
  playEventSound,
} from "./notify-sound";

const oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = [];

class FakeOscillator {
  frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  type: OscillatorType = "sine";
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
  constructor() {
    oscillators.push(this as never);
  }
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 3;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  constructor() {
    contexts.push(this);
  }
}

const windowStub = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal("window", windowStub);
vi.stubGlobal("AudioContext", FakeAudioContext);
let nowMs = 0;
vi.stubGlobal("performance", { now: () => nowMs });

const EVENTS: SoundEvent[] = [
  "streamOpen",
  "streamClose",
  "roomJoin",
  "roomLeave",
  "viewerJoin",
  "viewerLeave",
  "shareStart",
  "shareStop",
];

beforeEach(() => {
  oscillators.length = 0;
  contexts.length = 0;
  nowMs = 0;
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  destroyNotifySound();
  vi.useRealTimers();
});

describe("padrões de som", () => {
  it("cada evento tem assinatura única (freqs, tipos, ritmo, duração)", () => {
    const signatures = EVENTS.map((event) =>
      SOUND.PATTERNS[event]
        .map((n) => `${n.type}:${n.freq}:${n.at}:${n.dur}:${n.slideTo ?? "-"}`)
        .join("|"),
    );
    expect(new Set(signatures).size).toBe(EVENTS.length);
  });

  it("join sobe, leave desce e share usa fanfarra de 3 notas", () => {
    const open = SOUND.PATTERNS.streamOpen;
    const close = SOUND.PATTERNS.streamClose;
    expect(open[open.length - 1].freq).toBeGreaterThan(open[0].freq);
    expect(close[close.length - 1].freq).toBeLessThan(close[0].freq);
    expect(SOUND.PATTERNS.shareStart).toHaveLength(3);
    expect(SOUND.PATTERNS.shareStop).toHaveLength(3);
    expect(SOUND.PATTERNS.shareStart[2].freq).toBeGreaterThan(
      SOUND.PATTERNS.shareStart[0].freq,
    );
    expect(SOUND.PATTERNS.shareStop[2].freq).toBeLessThan(SOUND.PATTERNS.shareStop[0].freq);
  });

  it("roomJoin é knock duplo na mesma freq; roomLeave é nota única com slide", () => {
    const join = SOUND.PATTERNS.roomJoin;
    expect(join).toHaveLength(2);
    expect(join[0].freq).toBe(join[1].freq);
    expect(join[0].type).toBe("square");
    const leave = SOUND.PATTERNS.roomLeave;
    expect(leave).toHaveLength(1);
    expect(leave[0].slideTo).toBeLessThan(leave[0].freq);
  });
});

describe("playEventSound", () => {
  it("agenda osciladores no currentTime quando running", async () => {
    initNotifySound();
    await playEventSound("streamOpen");
    expect(oscillators.length).toBe(SOUND.PATTERNS.streamOpen.length);
    for (const osc of oscillators) {
      expect(osc.start.mock.calls[0][0]).toBeGreaterThanOrEqual(3);
    }
  });

  it("contexto suspended guarda o evento e toca quando resume resolve", async () => {
    initNotifySound();
    const ctx = contexts[0];
    ctx.state = "suspended";
    playEventSound("shareStart");
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(oscillators.length).toBe(0);
    await vi.waitFor(() =>
      expect(oscillators.length).toBe(SOUND.PATTERNS.shareStart.length),
    );
    for (const osc of oscillators) {
      expect(osc.start.mock.calls[0][0]).toBeGreaterThanOrEqual(3);
    }
  });

  it("evento pendente toca no 1º gesto que destrava o contexto", async () => {
    initNotifySound();
    const ctx = contexts[0];
    // resume() sem gesto não destrava de verdade — fica suspended.
    ctx.state = "suspended";
    ctx.resume = vi.fn(async () => {});
    playEventSound("roomJoin");
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators.length).toBe(0);
    // Gesto do usuário → listener chama resume → desta vez destrava.
    ctx.resume = vi.fn(async () => {
      ctx.state = "running";
    });
    const gesture = windowStub.addEventListener.mock.calls.find(
      ([type]) => type === "pointerdown",
    )?.[1] as (() => void) | undefined;
    gesture?.();
    await vi.waitFor(() =>
      expect(oscillators.length).toBe(SOUND.PATTERNS.roomJoin.length),
    );
  });

  it("evento pendente mais velho que PENDING_MAX_AGE é descartado", async () => {
    initNotifySound();
    const ctx = contexts[0];
    ctx.state = "suspended";
    playEventSound("streamOpen");
    nowMs += SOUND.PENDING_MAX_AGE_MS + 1;
    ctx.resume = vi.fn(async () => {
      ctx.state = "running";
    });
    const gesture = windowStub.addEventListener.mock.calls.find(
      ([type]) => type === "keydown",
    )?.[1] as (() => void) | undefined;
    gesture?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators.length).toBe(0);
  });

  it("resume que rejeita mantém o pendente para a próxima tentativa", async () => {
    initNotifySound();
    const ctx = contexts[0];
    ctx.state = "suspended";
    ctx.resume = vi.fn(async () => {
      throw new Error("autoplay");
    });
    expect(() => playEventSound("streamOpen")).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators.length).toBe(0);
  });

  it("resume falho libera o slot de burst para a próxima tentativa", async () => {
    let calls = 0;
    initNotifySound();
    const ctx = contexts[0];
    ctx.state = "suspended";
    ctx.resume = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("autoplay");
      ctx.state = "running";
    });
    playEventSound("streamOpen");
    await vi.advanceTimersByTimeAsync(0);
    expect(oscillators.length).toBe(0);
    playEventSound("streamOpen");
    await vi.waitFor(() =>
      expect(oscillators.length).toBe(SOUND.PATTERNS.streamOpen.length),
    );
  });

  it("burst de eventos iguais agenda uma única vez", async () => {
    initNotifySound();
    await Promise.all([
      playEventSound("roomJoin"),
      playEventSound("roomJoin"),
      playEventSound("roomJoin"),
    ]);
    expect(oscillators.length).toBe(SOUND.PATTERNS.roomJoin.length);
    nowMs += SOUND.BURST_WINDOW_MS + 50;
    await playEventSound("roomJoin");
    expect(oscillators.length).toBe(SOUND.PATTERNS.roomJoin.length * 2);
  });

  it("eventos distintos não são agrupados entre si", async () => {
    initNotifySound();
    await Promise.all([playEventSound("roomJoin"), playEventSound("roomLeave")]);
    expect(oscillators.length).toBe(
      SOUND.PATTERNS.roomJoin.length + SOUND.PATTERNS.roomLeave.length,
    );
  });
});

describe("init/destroy", () => {
  it("init registra gestos uma única vez (idempotente)", () => {
    initNotifySound();
    initNotifySound();
    expect(windowStub.addEventListener).toHaveBeenCalledTimes(2);
    expect(windowStub.addEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(windowStub.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("destroy remove listeners, fecha o contexto e impede novos sons", async () => {
    initNotifySound();
    await playEventSound("streamOpen");
    const before = oscillators.length;
    destroyNotifySound();
    expect(windowStub.removeEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    await playEventSound("streamOpen");
    expect(oscillators.length).toBe(before);
    expect(contexts.length).toBe(1);
  });
});
