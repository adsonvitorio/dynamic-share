import { describe, expect, it } from "vitest";
import type { Occupant } from "@share/shared";
import { occupantPreview } from "./occupants";
import occupantStackSrc from "./OccupantStack.svelte?raw";

const occ = (name: string, sharing = false): Occupant => ({
  id: `id-${name}`,
  name,
  avatarUrl: null,
  ...(sharing ? { sharing: true } : {}),
});

describe("occupantPreview", () => {
  it("retorna todos quando cabem no max", () => {
    const occupants = [occ("a"), occ("b")];
    expect(occupantPreview(occupants, 2, 5)).toEqual({ visible: occupants, extra: 0 });
  });

  it("corta no max e expõe extra pelo participantCount total", () => {
    const occupants = [occ("a"), occ("b"), occ("c"), occ("d"), occ("e")];
    const { visible, extra } = occupantPreview(occupants, 8, 3);
    expect(visible).toHaveLength(3);
    expect(extra).toBe(5);
  });

  it("extra conta participantes sem nome resolvido", () => {
    const occupants = [occ("a")];
    expect(occupantPreview(occupants, 4, 5).extra).toBe(3);
  });

  it("vazio quando não há occupants", () => {
    expect(occupantPreview([], 0, 5)).toEqual({ visible: [], extra: 0 });
  });

  it("extra nunca fica negativo", () => {
    expect(occupantPreview([occ("a"), occ("b")], 1, 5).extra).toBe(0);
  });

  it("sharers lideram o stack, mantendo ordem de entrada", () => {
    const { visible } = occupantPreview(
      [occ("a"), occ("b", true), occ("c"), occ("d", true)],
      4,
      5,
    );
    expect(visible.map((o) => o.name)).toEqual(["b", "d", "a", "c"]);
  });

  it("sharer além do max fica visível — sort antes do slice", () => {
    const { visible } = occupantPreview(
      [occ("a"), occ("b"), occ("c"), occ("sharer", true)],
      4,
      2,
    );
    expect(visible.map((o) => o.name)).toEqual(["sharer", "a"]);
  });
});

describe("OccupantStack — direção vertical (rail recolhida)", () => {
  it("template tem o caminho vertical (-space-y-2 + flex-col)", () => {
    expect(occupantStackSrc).toContain("-space-y-2");
    expect(occupantStackSrc).toContain("flex-col");
    expect(occupantStackSrc).toContain("vertical");
  });
});
