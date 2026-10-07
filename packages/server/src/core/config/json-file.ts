import { readFile, stat } from "node:fs/promises";
import type { z } from "zod";

interface JsonSourceOptions {
  label: string;
}

export class JsonFileSource<T> {
  private cache: { mtimeMs: number; value: T } | null = null;
  private inflight: Promise<T> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly schema: z.ZodType<T>,
    private readonly opts: JsonSourceOptions,
  ) {}

  async get(): Promise<T> {
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(this.filePath)).mtimeMs;
    } catch {
      this.cache = null;
      throw new JsonSourceError(`${this.opts.label}: arquivo ausente (${this.filePath})`);
    }
    if (this.cache && this.cache.mtimeMs === mtimeMs) {
      return this.cache.value;
    }
    this.inflight ??= this.load(mtimeMs).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(mtimeMs: number): Promise<T> {
    const raw = await readFile(this.filePath, "utf8");
    const parsed = this.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new JsonSourceError(
        `${this.opts.label}: JSON inválido em ${this.filePath}: ${parsed.error.issues[0]?.message}`,
      );
    }
    this.cache = { mtimeMs, value: parsed.data };
    return parsed.data;
  }

  invalidate(): void {
    this.cache = null;
  }
}

export class JsonSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonSourceError";
  }
}
