import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionEvents } from "../src/modules/auth/session-events.js";
import { SSE } from "../src/core/config/constants.js";

function fakeRes(opts: { failOn?: string } = {}): ServerResponse & { written: string[]; ended: boolean } {
  const res = new EventEmitter() as ServerResponse & { written: string[]; ended: boolean };
  res.written = [];
  res.ended = false;
  res.writableEnded = false;
  res.write = ((chunk: string) => {
    if (opts.failOn !== undefined && chunk.includes(opts.failOn)) throw new Error("socket dead");
    res.written.push(chunk);
    return true;
  }) as ServerResponse["write"];
  res.end = (() => {
    res.ended = true;
    res.writableEnded = true;
    return res;
  }) as ServerResponse["end"];
  return res;
}

describe("SessionEvents", () => {
  let events: SessionEvents;
  beforeEach(() => {
    events = new SessionEvents();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("add escreve retry e registra o stream sob o jti", () => {
    const res = fakeRes();
    events.add("jti-1", res);
    expect(res.written[0]).toBe(`retry: ${SSE.RETRY_MS}\n\n`);
    expect(events.streamCount("jti-1")).toBe(1);
  });

  it("send escreve event e data para todos os streams do jti", () => {
    const a = fakeRes();
    const b = fakeRes();
    events.add("jti-1", a);
    events.add("jti-1", b);
    events.send("jti-1", { type: "session_replaced" });
    const frame = 'event: session_replaced\ndata: {"type":"session_replaced"}\n\n';
    expect(a.written).toContain(frame);
    expect(b.written).toContain(frame);
  });

  it("keepalive escreve ': ka' no intervalo e para após remove", () => {
    const res = fakeRes();
    events.add("jti-1", res);
    vi.advanceTimersByTime(SSE.KEEPALIVE_MS + 10);
    expect(res.written).toContain(": ka\n\n");
    const count = res.written.length;
    events.remove("jti-1", res);
    vi.advanceTimersByTime(SSE.KEEPALIVE_MS * 2);
    expect(res.written.length).toBe(count);
    expect(events.streamCount("jti-1")).toBe(0);
  });

  it("notifyReplaced envia evento e encerra os streams", () => {
    const a = fakeRes();
    const b = fakeRes();
    events.add("jti-1", a);
    events.add("jti-1", b);
    events.notifyReplaced("jti-1");
    expect(a.ended).toBe(true);
    expect(b.ended).toBe(true);
    expect(events.streamCount("jti-1")).toBe(0);
  });

  it("stream que falha na escrita é descartado", () => {
    const dead = fakeRes({ failOn: "event:" });
    const alive = fakeRes();
    events.add("jti-1", dead);
    events.add("jti-1", alive);
    dead.written = [];
    events.send("jti-1", { type: "session_replaced" });
    expect(events.streamCount("jti-1")).toBe(1);
    expect(alive.written.length).toBeGreaterThan(0);
  });

  it("closeAll encerra tudo e limpa keepalives", () => {
    const a = fakeRes();
    events.add("jti-1", a);
    events.add("jti-2", fakeRes());
    events.closeAll();
    expect(a.ended).toBe(true);
    expect(events.streamCount()).toBe(0);
    vi.advanceTimersByTime(SSE.KEEPALIVE_MS * 3);
    expect(a.written.filter((w) => w === ": ka\n\n").length).toBe(0);
  });

  it("res.on close remove o stream", () => {
    const res = fakeRes();
    events.add("jti-1", res);
    res.emit("close");
    expect(events.streamCount("jti-1")).toBe(0);
  });

  it("broadcast entrega a todos os streams", () => {
    const a = fakeRes();
    const b = fakeRes();
    const c = fakeRes();
    events.add("jti-1", a);
    events.add("jti-2", b);
    events.add("jti-3", c);
    const event = { type: "rooms_updated" as const, room: "sala", live: true, participantCount: 2 };
    events.broadcast(event);
    const frame = `event: rooms_updated\ndata: ${JSON.stringify(event)}\n\n`;
    expect(a.written).toContain(frame);
    expect(b.written).toContain(frame);
    expect(c.written).toContain(frame);
  });

  it("broadcast descarta stream morta durante o envio", () => {
    const dead = fakeRes({ failOn: "event:" });
    const alive = fakeRes();
    events.add("jti-1", dead);
    events.add("jti-2", alive);
    dead.written = [];
    const event = { type: "rooms_updated" as const, room: "sala", live: false, participantCount: 0 };
    events.broadcast(event);
    expect(events.streamCount("jti-1")).toBe(0);
    expect(alive.written).toContain(`event: rooms_updated\ndata: ${JSON.stringify(event)}\n\n`);
  });
});
