import type { ServerResponse } from "node:http";
import type { SseEvent } from "@share/shared";
import { SSE } from "../../core/config/constants.js";
import { createLogger } from "../../core/logging/logger.js";

const log = createLogger("SessionEvents");

export class SessionEvents {
  private streams = new Map<string, Set<ServerResponse>>();
  private keepalives = new Map<ServerResponse, NodeJS.Timeout>();
  private streamJti = new Map<ServerResponse, string>();

  add(jti: string, res: ServerResponse): void {
    let set = this.streams.get(jti);
    if (!set) {
      set = new Set();
      this.streams.set(jti, set);
    }
    set.add(res);
    this.streamJti.set(res, jti);
    try {
      res.write(`retry: ${SSE.RETRY_MS}\n\n`);
    } catch {
      this.dropStream(jti, res);
      return;
    }
    const interval = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(": ka\n\n");
      } catch {
        this.dropStream(jti, res);
      }
    }, SSE.KEEPALIVE_MS);
    interval.unref();
    this.keepalives.set(res, interval);
    res.on("close", () => this.dropStream(jti, res));
  }

  remove(jti: string, res: ServerResponse): void {
    this.dropStream(jti, res);
  }

  send(jti: string, event: SseEvent): void {
    const set = this.streams.get(jti);
    if (!set) return;
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try {
        res.write(frame);
      } catch {
        this.dropStream(jti, res);
      }
    }
  }

  broadcast(event: SseEvent): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const [res, jti] of this.streamJti) {
      try {
        res.write(frame);
      } catch {
        this.dropStream(jti, res);
      }
    }
  }

  notifyReplaced(jti: string): void {
    const set = this.streams.get(jti);
    if (!set) return;
    this.send(jti, { type: "session_replaced" });
    for (const res of [...set]) {
      this.endStream(jti, res);
    }
  }

  closeJti(jti: string): void {
    const set = this.streams.get(jti);
    if (!set) return;
    for (const res of [...set]) {
      this.endStream(jti, res);
    }
  }

  closeAll(): void {
    for (const [jti, set] of this.streams) {
      for (const res of [...set]) {
        this.endStream(jti, res);
      }
    }
  }

  streamCount(jti?: string): number {
    if (jti !== undefined) return this.streams.get(jti)?.size ?? 0;
    let n = 0;
    for (const set of this.streams.values()) n += set.size;
    return n;
  }

  private dropStream(jti: string, res: ServerResponse): void {
    const interval = this.keepalives.get(res);
    if (interval) {
      clearInterval(interval);
      this.keepalives.delete(res);
    }
    this.streamJti.delete(res);
    const set = this.streams.get(jti);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.streams.delete(jti);
  }

  private endStream(jti: string, res: ServerResponse): void {
    this.dropStream(jti, res);
    try {
      res.end();
    } catch (err) {
      log.warn("stream_end_failed", { err });
    }
  }
}
