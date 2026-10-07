import { describe, expect, it } from "vitest";
import dropdownSrc from "./DropdownMenu.svelte?raw";
import audioControlsSrc from "./AudioControls.svelte?raw";
import userChipSrc from "../rail/UserChip.svelte?raw";

describe("dropdowns abrem para cima (UR-07)", () => {
  it("DropdownMenu default é direction=\"up\"", () => {
    expect(dropdownSrc).toContain('direction = "up"');
    expect(dropdownSrc).toContain("menuAnchorClass(direction)");
  });

  it("popover de volume do AudioControls ancora acima", () => {
    expect(audioControlsSrc).toContain("menuAnchorClass('up')");
    expect(audioControlsSrc).not.toContain("top-full");
  });
});

describe("painéis de menu são opacos sobre o vídeo", () => {
  it("DropdownMenu usa superfície sólida sem blur", () => {
    expect(dropdownSrc).toContain("bg-base-deep p-1.5");
    expect(dropdownSrc).not.toContain("bg-base/95");
  });

  it("popover de volume usa superfície sólida sem blur", () => {
    expect(audioControlsSrc).toContain("bg-base-deep px-3");
    expect(audioControlsSrc).not.toContain("bg-base/95");
  });

  it("menu do usuário usa superfície sólida sem blur", () => {
    expect(userChipSrc).toContain("bg-base-deep p-3");
    expect(userChipSrc).not.toContain("bg-base/95");
  });
});
