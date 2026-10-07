import { describe, expect, it } from "vitest";
import { aspectFit, effectiveDims, fitAspect } from "./videoAspect";

describe("fitAspect", () => {
  it("retorna a razão CSS do vídeo", () => {
    expect(fitAspect(1920, 1080)).toBe("1920 / 1080");
    expect(fitAspect(1280, 720)).toBe("1280 / 720");
  });

  it("retorna vazio para dimensões inválidas", () => {
    expect(fitAspect(0, 1080)).toBe("");
    expect(fitAspect(1920, 0)).toBe("");
    expect(fitAspect(-16, 9)).toBe("");
    expect(fitAspect(Number.NaN, 1080)).toBe("");
    expect(fitAspect(Infinity, 1080)).toBe("");
  });
});

describe("aspectFit", () => {
  it("vídeo mais largo que o container limita pela largura", () => {
    expect(aspectFit(1920, 1080, 800, 600)).toBe("width");
    expect(aspectFit(2560, 1080, 1000, 800)).toBe("width");
  });

  it("vídeo mais estreito que o container limita pela altura", () => {
    expect(aspectFit(1080, 1920, 800, 600)).toBe("height");
    expect(aspectFit(720, 1280, 1600, 900)).toBe("height");
  });

  it("razões iguais tratam como width (h == w/a)", () => {
    expect(aspectFit(1600, 900, 800, 450)).toBe("width");
  });

  it("retorna none sem metadados ou container medido", () => {
    expect(aspectFit(0, 0, 800, 600)).toBe("none");
    expect(aspectFit(1920, 1080, 0, 600)).toBe("none");
    expect(aspectFit(1920, 1080, 800, 0)).toBe("none");
    expect(aspectFit(1920, 1080, -1, 600)).toBe("none");
  });
});

describe("effectiveDims — footprint estável do card", () => {
  const FALLBACK = { width: 16, height: 9 };

  it("assistindo com dimensões reais usa as reais", () => {
    expect(effectiveDims(2560, 1080, true, FALLBACK)).toEqual({ width: 2560, height: 1080 });
  });

  it("não-assistindo ignora dims persistidas — sempre o fallback", () => {
    expect(effectiveDims(2560, 1080, false, FALLBACK)).toEqual(FALLBACK);
    expect(effectiveDims(0, 0, false, FALLBACK)).toEqual(FALLBACK);
  });

  it("assistindo sem metadados ainda usa o fallback", () => {
    expect(effectiveDims(0, 0, true, FALLBACK)).toEqual(FALLBACK);
    expect(effectiveDims(1920, 0, true, FALLBACK)).toEqual(FALLBACK);
  });
});
