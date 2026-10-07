import { describe, expect, it } from "vitest";
import { menuAnchorClass } from "./menuPosition";

describe("menuAnchorClass", () => {
  it("up ancora o menu acima do trigger com gap da barra", () => {
    const cls = menuAnchorClass("up");
    expect(cls).toContain("bottom-full");
    expect(cls).toContain("pb-3");
    expect(cls).not.toContain("top-full");
  });

  it("down ancora o menu abaixo do trigger com gap", () => {
    const cls = menuAnchorClass("down");
    expect(cls).toContain("top-full");
    expect(cls).toContain("pt-3");
    expect(cls).not.toContain("bottom-full");
  });
});
