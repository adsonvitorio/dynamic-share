import { describe, expect, it } from "vitest";
import type { RoomPresence } from "@share/shared";
import {
  roomButtonLabel,
  roomIconClass,
  roomItemClass,
  roomListClass,
  userMenuPositionClass,
} from "./rail";

const base: RoomPresence = {
  name: "sala-a",
  displayName: "Sala A",
  live: false,
  participantCount: 0,
  occupants: [],
};

describe("roomButtonLabel", () => {
  it("sala idle expõe só o nome", () => {
    expect(roomButtonLabel(base, "AO VIVO")).toBe("Sala A");
  });

  it("sala live inclui badge e contagem para leitores de tela", () => {
    const live = { ...base, live: true, participantCount: 4 };
    expect(roomButtonLabel(live, "AO VIVO")).toBe("Sala A — AO VIVO (4)");
  });

  it("formata o badge de live passado", () => {
    const live = { ...base, live: true, participantCount: 2 };
    expect(roomButtonLabel(live, "NO AR")).toBe("Sala A — NO AR (2)");
  });
});

describe("roomListClass/roomItemClass", () => {
  it("lista e item ocupam a largura toda — pill indicadora encosta na borda do rail", () => {
    expect(roomListClass()).toContain("w-full");
    expect(roomItemClass()).toContain("w-full");
    expect(roomItemClass()).toContain("relative");
  });
});

describe("roomIconClass — formato expandido permanente", () => {
  it("ícone é rounded-2xl em qualquer estado, nunca circular", () => {
    expect(roomIconClass(false)).toContain("rounded-2xl");
    expect(roomIconClass(true)).toContain("rounded-2xl");
    expect(roomIconClass(false)).not.toContain("rounded-full");
    expect(roomIconClass(true)).not.toContain("rounded-full");
  });

  it("selecionado não ganha anel/glow — pill lateral é o indicador", () => {
    expect(roomIconClass(true)).not.toContain("shadow-glow");
    expect(roomIconClass(true)).not.toContain("ring-");
  });
});

describe("userMenuPositionClass", () => {
  it("menu da conta usa position:fixed (fora do container com overflow)", () => {
    expect(userMenuPositionClass()).toContain("fixed");
    expect(userMenuPositionClass()).not.toContain("absolute");
  });
});

describe("roomListClass — salas visíveis em todo breakpoint", () => {
  it("nunca esconde a lista via classes responsivas", () => {
    expect(roomListClass()).not.toMatch(/\bhidden\b/);
    expect(roomListClass()).not.toMatch(/\blg:hidden\b/);
    expect(roomListClass()).not.toMatch(/\bmax-lg:/);
  });
});
