import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createLogger } from "../../core/logging/logger.js";

const log = createLogger("SessionRegistry");

const snapshotSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.object({ jti: z.string(), iat: z.number() })),
});

interface RegistryEntry {
  jti: string;
  iat: number;
}

export type SessionCheck = "ok" | "replaced" | "expired";

export class SessionRegistry {
  private entries = new Map<string, RegistryEntry>();
  private persistQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly snapshotPath: string | null) {}

  static memory(): SessionRegistry {
    return new SessionRegistry(null);
  }

  static key(sub: string): string {
    return sub;
  }

  static async load(snapshotPath: string): Promise<SessionRegistry> {
    const registry = new SessionRegistry(snapshotPath);
    try {
      const raw = await readFile(snapshotPath, "utf8");
      const parsed = snapshotSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        log.warn("snapshot_load_failed", { reason: "invalid_schema" });
        return registry;
      }
      for (const [key, entry] of Object.entries(parsed.data.entries)) {
        registry.entries.set(key, entry);
      }
      log.info("snapshot_loaded", { sessions: registry.entries.size });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn("snapshot_load_failed", { err });
      }
    }
    return registry;
  }

  register(key: string, jti: string): { replacedJti?: string } {
    const previous = this.entries.get(key);
    this.entries.set(key, { jti, iat: Date.now() });
    void this.persist();
    return previous ? { replacedJti: previous.jti } : {};
  }

  resolve(key: string): string | null {
    return this.entries.get(key)?.jti ?? null;
  }

  check(key: string, jti: string): SessionCheck {
    const entry = this.entries.get(key);
    if (!entry) return "expired";
    return entry.jti === jti ? "ok" : "replaced";
  }

  remove(key: string): void {
    this.entries.delete(key);
    void this.persist();
  }

  /** Subs com sessão viva — usado pelo gate de join do LiveKit. */
  subs(): IterableIterator<string> {
    return this.entries.keys();
  }

  get size(): number {
    return this.entries.size;
  }

  async persist(): Promise<void> {
    if (!this.snapshotPath) return;
    this.persistQueue = this.persistQueue.then(() => this.writeSnapshot());
    return this.persistQueue;
  }

  private async writeSnapshot(): Promise<void> {
    const snapshotPath = this.snapshotPath;
    if (!snapshotPath) return;
    const snapshot = {
      version: 1 as const,
      entries: Object.fromEntries(this.entries),
    };
    const tmp = `${snapshotPath}.tmp`;
    try {
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeFile(tmp, JSON.stringify(snapshot), "utf8");
      await rename(tmp, snapshotPath);
    } catch (err) {
      log.error("snapshot_write_failed", { err });
    }
  }
}
