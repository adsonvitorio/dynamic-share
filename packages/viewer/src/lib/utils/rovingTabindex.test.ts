import { describe, expect, it } from "vitest";
import { nextRovingIndex } from "./rovingTabindex";

describe("nextRovingIndex", () => {
  it("setas movem dentro dos limites sem wrap", () => {
    expect(nextRovingIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextRovingIndex(2, "ArrowDown", 3)).toBe(2);
    expect(nextRovingIndex(1, "ArrowUp", 3)).toBe(0);
    expect(nextRovingIndex(0, "ArrowUp", 3)).toBe(0);
  });

  it("setas laterais movem como up/down (nav em grid)", () => {
    expect(nextRovingIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextRovingIndex(2, "ArrowRight", 3)).toBe(2);
    expect(nextRovingIndex(1, "ArrowLeft", 3)).toBe(0);
    expect(nextRovingIndex(0, "ArrowLeft", 3)).toBe(0);
  });

  it("Home/End saltam para as pontas", () => {
    expect(nextRovingIndex(1, "Home", 4)).toBe(0);
    expect(nextRovingIndex(1, "End", 4)).toBe(3);
  });

  it("teclas irrelevantes retornam null", () => {
    expect(nextRovingIndex(1, "Enter", 3)).toBeNull();
    expect(nextRovingIndex(1, "a", 3)).toBeNull();
  });

  it("lista vazia retorna null", () => {
    expect(nextRovingIndex(0, "ArrowDown", 0)).toBeNull();
  });
});
