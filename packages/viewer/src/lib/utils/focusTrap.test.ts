import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "./focusTrap";

describe("nextFocusIndex", () => {
  it("Tab avança e volta ao início", () => {
    expect(nextFocusIndex(0, "Tab", 3)).toBe(1);
    expect(nextFocusIndex(2, "Tab", 3)).toBe(0);
  });

  it("Shift+Tab retrocede e volta ao fim", () => {
    expect(nextFocusIndex(2, "ShiftTab", 3)).toBe(1);
    expect(nextFocusIndex(0, "ShiftTab", 3)).toBe(2);
  });

  it("fora da lista, Tab foca o primeiro", () => {
    expect(nextFocusIndex(-1, "Tab", 3)).toBe(0);
  });

  it("lista vazia retorna -1", () => {
    expect(nextFocusIndex(0, "Tab", 0)).toBe(-1);
  });
});
