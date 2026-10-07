import { describe, expect, it } from "vitest";
import { maskedId } from "../src/core/logging/pii.js";

describe("maskedId", () => {
  it("null/undefined/vazio viram <none>", () => {
    expect(maskedId(null)).toBe("<none>");
    expect(maskedId(undefined)).toBe("<none>");
    expect(maskedId("")).toBe("<none>");
  });

  it("id curto (<=8) mostra 3 chars + ...", () => {
    expect(maskedId("abcdefgh")).toBe("abc...");
    expect(maskedId("abcd")).toBe("abc...");
  });

  it("id <=3 chars não vaza nada", () => {
    expect(maskedId("abc")).toBe("...");
    expect(maskedId("ab")).toBe("...");
    expect(maskedId("a")).toBe("...");
  });

  it("id longo (>8) mostra 8 chars + ...", () => {
    expect(maskedId("123456789012345678")).toBe("12345678...");
    expect(maskedId("abcdefghi")).toBe("abcdefgh...");
  });

  it("nunca retorna o id completo", () => {
    const id = "123456789012345678";
    const masked = maskedId(id);
    expect(masked).not.toBe(id);
    expect(masked.endsWith("...")).toBe(true);
    expect(id.startsWith(masked.slice(0, -3))).toBe(true);
  });
});
