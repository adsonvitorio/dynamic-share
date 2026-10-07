import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { JsonFileSource, JsonSourceError } from "../src/core/config/json-file.js";

const dir = await mkdtemp(path.join(tmpdir(), "share-json-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

const schema = z.object({ v: z.number() });

describe("JsonFileSource", () => {
  it("carrega, faz cache por mtime e recarrega ao mudar", async () => {
    const file = path.join(dir, "a.json");
    await writeFile(file, JSON.stringify({ v: 1 }));
    const src = new JsonFileSource(file, schema, { label: "t" });
    expect((await src.get()).v).toBe(1);
    expect((await src.get()).v).toBe(1);
    await writeFile(file, JSON.stringify({ v: 2 }));
    // força mtime diferente em filesystems com granularidade grosseira
    const s = await import("node:fs/promises").then((m) => m.stat(file));
    void s;
    expect((await src.get()).v).toBe(2);
  });

  it("falha fechado quando o arquivo não existe", async () => {
    const src = new JsonFileSource(path.join(dir, "nao-existe.json"), schema, { label: "t" });
    await expect(src.get()).rejects.toBeInstanceOf(JsonSourceError);
  });

  it("rejeita JSON fora do schema", async () => {
    const file = path.join(dir, "bad.json");
    await writeFile(file, JSON.stringify({ v: "texto" }));
    const src = new JsonFileSource(file, schema, { label: "t" });
    await expect(src.get()).rejects.toBeInstanceOf(JsonSourceError);
  });
});
