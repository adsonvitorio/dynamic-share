import { describe, expect, it } from "vitest";
import layoutSrc from "../../routes/+layout.svelte?raw";
import statusSrc from "./StatusScreen.svelte?raw";

function countOrbs(src: string): number {
  return (src.match(/<Orbs/g) ?? []).length;
}

describe("camada de fundo (Orbs)", () => {
  it("Orbs é renderizado uma única vez, no layout", () => {
    expect(countOrbs(layoutSrc)).toBe(1);
  });

  it("StatusScreen não renderiza Orbs (evita duplicação nas telas de status)", () => {
    expect(countOrbs(statusSrc)).toBe(0);
    expect(statusSrc).not.toContain("Orbs");
  });
});
