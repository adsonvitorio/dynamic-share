import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

afterEach(() => {
  warnSpy.mockClear();
  errorSpy.mockClear();
  infoSpy.mockClear();
});

describe("logger — redactSecrets", () => {
  const log = createLogger("Test");

  it("redige token=... em argumentos string", () => {
    log.warn("evt", "falhou token=abcdef1234567890 fim");
    const args = warnSpy.mock.calls[0];
    expect(args[1]).toBe("falhou <redacted> fim");
    expect(JSON.stringify(args)).not.toContain("abcdef1234567890");
  });

  it("redige token:... e token ... variantes case-insensitive", () => {
    log.warn("evt", "Token: abcdef123456", "TOKEN abcdef123456");
    const args = warnSpy.mock.calls[0];
    expect(args[1]).toContain("<redacted>");
    expect(args[2]).toContain("<redacted>");
  });

  it("redige session=... (cookie)", () => {
    log.error("evt", "cookie session=supersecretvalue123");
    const args = errorSpy.mock.calls[0];
    // o pattern de cookie cobre a string inteira — segredo não aparece
    expect(args[1]).toBe("<redacted>");
    expect(JSON.stringify(args)).not.toContain("supersecretvalue123");
  });

  it("redige secret=, cookie= e Authorization em qualquer casing", () => {
    log.warn(
      "evt",
      "SECRET=hunter2hunter2",
      "Cookie: session=abc123456789",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
    );
    const args = warnSpy.mock.calls[0];
    for (const a of [args[1], args[2], args[3]]) {
      expect(String(a)).toContain("<redacted>");
    }
    expect(JSON.stringify(args)).not.toContain("hunter2hunter2");
    expect(JSON.stringify(args)).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("não altera strings sem segredo nem não-strings", () => {
    log.warn("evt", "normal", 42, { a: 1 });
    const args = warnSpy.mock.calls[0];
    expect(args[1]).toBe("normal");
    expect(args[2]).toBe(42);
    expect(args[3]).toEqual({ a: 1 });
  });

  it("prefixa [modulo] evento", () => {
    log.warn("meu_evento", "x");
    expect(warnSpy.mock.calls[0][0]).toBe("[Test] meu_evento");
  });
});

describe("logger — níveis", () => {
  it("minLevel=warn default → debug/info suprimidos", () => {
    const log = createLogger("Lvl");
    log.debug("d");
    log.info("i");
    expect(infoSpy).not.toHaveBeenCalled();
    log.warn("w");
    expect(warnSpy).toHaveBeenCalled();
    log.error("e");
    expect(errorSpy).toHaveBeenCalled();
  });
});
