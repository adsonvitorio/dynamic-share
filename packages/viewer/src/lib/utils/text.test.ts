import { describe, expect, it } from "vitest";
import { getInitials, sanitizeDisplayName } from "./text";

describe("sanitizeDisplayName", () => {
  it("remove chars HTML-perigosos", () => {
    expect(sanitizeDisplayName('<img onerror="x">')).toBe("img onerror=x");
    expect(sanitizeDisplayName("a<b>c\"d'e&f")).toBe("abcdef");
  });

  it("remove chars de controle (\\x00-\\x1f, \\x7f)", () => {
    expect(sanitizeDisplayName("a\x00b\x1fc\x7fd")).toBe("abcd");
    expect(sanitizeDisplayName("linha\ncom\tquebra")).toBe("linhacomquebra");
  });

  it("faz trim das pontas", () => {
    expect(sanitizeDisplayName("  Nick  ")).toBe("Nick");
  });

  it("mantém unicode legítimo", () => {
    expect(sanitizeDisplayName("José 🎥")).toBe("José 🎥");
  });
});

describe("getInitials", () => {
  it("duas+ palavras → primeira+última inicial", () => {
    expect(getInitials("Nick Silva")).toBe("NS");
    expect(getInitials("Ana Maria Souza")).toBe("AS");
  });

  it("uma palavra → 2 primeiras letras", () => {
    expect(getInitials("Nick")).toBe("NI");
    expect(getInitials("A")).toBe("A");
  });

  it("vazio/só-sanitizados → '?'", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("<>")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });

  it("maiúsculas aplicadas", () => {
    expect(getInitials("nick silva")).toBe("NS");
  });

  it("unicode: emoji no início não quebra surrogate pair", () => {
    expect(getInitials("🎥 Silva")).toBe("🎥S");
    expect(getInitials("🎥🎬")).toBe("🎥🎬");
  });
});
