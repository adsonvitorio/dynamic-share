import { describe, expect, it } from "vitest";
import { layoutModel, LAYOUT_CLASSES } from "./layoutModel";

describe("layoutModel", () => {
  it("seleciona os tiers por largura", () => {
    expect(layoutModel(800).tier).toBe("base");
    expect(layoutModel(1024).tier).toBe("lg");
    expect(layoutModel(1279).tier).toBe("lg");
    expect(layoutModel(1280).tier).toBe("xl");
    expect(layoutModel(1535).tier).toBe("xl");
    expect(layoutModel(1536).tier).toBe("2xl");
    expect(layoutModel(2560).tier).toBe("2xl");
  });

  it("cresce larguras de colunas conforme a tela", () => {
    const lg = layoutModel(1100);
    const xl = layoutModel(1400);
    const xxl = layoutModel(1920);
    expect(lg.roomsWidth).toBe(240);
    expect(xl.roomsWidth).toBe(272);
    expect(xxl.roomsWidth).toBe(288);
    expect(lg.membersWidth).toBe(200);
    expect(xl.membersWidth).toBe(240);
    expect(xxl.membersWidth).toBe(272);
  });
});

describe("LAYOUT_CLASSES segue o modelo", () => {
  it("classes das colunas carregam os mesmos px por breakpoint", () => {
    for (const width of [1100, 1400, 1920]) {
      const spec = layoutModel(width);
      const bp = spec.tier;
      expect(LAYOUT_CLASSES.rooms).toContain(`${bp}:w-[${spec.roomsWidth}px]`);
      expect(LAYOUT_CLASSES.members).toContain(`${bp}:w-[${spec.membersWidth}px]`);
    }
    expect(LAYOUT_CLASSES.stageMax).toContain(`${layoutModel(1920).stageMaxWidth}px`);
  });
});
