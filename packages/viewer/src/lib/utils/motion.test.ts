import { afterEach, describe, expect, it, vi } from "vitest";
import { occupantLeave, prefersReducedMotion } from "./motion";

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
  it("reflete o matchMedia", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("sem window retorna false", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("occupantLeave", () => {
  const node = {} as Element;

  it("reduced-motion retorna transição instantânea", () => {
    stubMatchMedia(true);
    expect(occupantLeave(node).duration).toBe(0);
  });

  it("motion normal delega ao scale com duração", () => {
    stubMatchMedia(false);
    vi.stubGlobal("getComputedStyle", () => ({
      transform: "none",
      opacity: "1",
      getPropertyValue: () => "",
    }));
    const config = occupantLeave(node);
    expect(config.duration).toBe(160);
  });
});
