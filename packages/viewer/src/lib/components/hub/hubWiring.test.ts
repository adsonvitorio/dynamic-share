import { describe, expect, it } from "vitest";
import roomsPageSrc from "../../../routes/rooms/+page.svelte?raw";
import appShellSrc from "../AppShell.svelte?raw";
import roomsHubSrc from "./RoomsHub.svelte?raw";
import roomEntrySrc from "./RoomEntry.svelte?raw";
import occupantStackSrc from "./OccupantStack.svelte?raw";
import occupantSectionSrc from "./OccupantSection.svelte?raw";
import roomStageSrc from "../stage/RoomStage.svelte?raw";
import { RAILS } from "$lib/constants";

describe("hub /rooms dedicado", () => {
  it("a página renderiza o RoomsHub", () => {
    expect(roomsPageSrc).toContain("RoomsHub");
  });

  it("AppShell não tem coluna de salas nem estado de drawer", () => {
    expect(appShellSrc).not.toContain("RoomsColumn");
    expect(appShellSrc).not.toContain("columnOpen");
    expect(appShellSrc).not.toContain("components/column");
  });

  it("RoomEntry renderiza CTA visual via joinHint", () => {
    expect(roomEntrySrc).toContain("joinHint");
  });

  it("IconRail é escondido no hub /rooms", () => {
    expect(appShellSrc).toContain('"/rooms"');
    expect(appShellSrc).toMatch(/\{#if\s+!isHub\}/);
  });

  it("main clippa overflow na rota de sala (scroll transitório)", () => {
    expect(appShellSrc).toContain("inRoom");
    // direção importa: clipa em sala, scrolla fora — inversão = regressão
    expect(appShellSrc).toMatch(/inRoom\s*\?\s*'overflow-hidden'\s*:\s*'overflow-y-auto'/);
  });

  it("RoomsHub mantém logout acessível sem o rail", () => {
    expect(roomsHubSrc).toContain("connectionStore.logout");
    expect(roomsHubSrc).toContain("copy.logout");
  });

  it("header do stage não duplica o ícone da sala (só nome)", () => {
    expect(roomStageSrc).not.toContain("roomIcon");
    expect(roomStageSrc).not.toMatch(/header[\s\S]{0,400}<img/);
  });

  it("cards mostram ocupantes mesmo sem live", () => {
    // gate é occupants.length dentro de OccupantSection — não room.live
    expect(occupantSectionSrc).toMatch(/\{#if\s+occupants\.length\s*>\s*0\}/);
    expect(roomEntrySrc).toContain("OccupantSection");
  });

  it("OccupantSection destaca o sharer (avatar + sharingNow + ring-live)", () => {
    expect(occupantSectionSrc).toContain("occupants.find((o) => o.sharing)");
    expect(occupantSectionSrc).toContain("copy.sharingNow");
    expect(occupantSectionSrc).toContain("ring-live");
  });

  it("OccupantStack marca sharers com ring-live", () => {
    expect(occupantStackSrc).toContain('occupant.sharing ? "ring-live" : "ring-base"');
  });

  it("OccupantStack keyed por occupant.id — nomes iguais não colidem", () => {
    // keyed por name quebrava com display names duplicados (crash do each)
    expect(occupantStackSrc).toContain("as occupant (occupant.id)");
    expect(occupantStackSrc).not.toContain("as occupant (occupant.name)");
  });

  it("entries resolvem ícone temático via resolveRoomIcon", () => {
    expect(roomEntrySrc).toContain("resolveRoomIcon");
  });

  it("img nunca recebe scheme icon: — isIconUrl guarda o fallback", () => {
    expect(roomEntrySrc).toContain("isIconUrl(room.icon)");
  });

  it("rest-stack desconta o sharer featured (participantCount - 1)", () => {
    expect(occupantSectionSrc).toContain("participantCount - 1");
  });

  it("sharer em foco mantém contagem de quem mais está na sala", () => {
    // só o stack sem texto deixava o "resto da sala" imperceptível
    expect(occupantSectionSrc).toMatch(/rest\.length\s*>\s*0/);
    expect(occupantSectionSrc).toContain("copy.inRoomNow(participantCount - 1)");
  });

  it("stack de occupants vai até 8 fotos (SHARED_LIMITS)", () => {
    expect(RAILS.OCCUPANT_STACK_MAX).toBe(8);
    expect(occupantStackSrc).toContain("RAILS.OCCUPANT_STACK_MAX");
  });

  it("cards mantêm o formato largo — grid nunca passa de 2 colunas", () => {
    // xl:grid-cols-3 encolhia os cards no maximizado e o texto cortava;
    // o formato de tela menor (2 colunas largas) é o contrato.
    expect(roomsHubSrc).not.toContain("xl:grid-cols-3");
    expect(roomsHubSrc).toContain("sm:grid-cols-2");
    expect(roomEntrySrc).toContain("truncate");
  });
});
