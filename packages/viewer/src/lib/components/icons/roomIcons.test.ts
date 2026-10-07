import { describe, expect, it } from "vitest";
import { isIconUrl, resolveRoomIcon, ROOM_ICON_SCHEME } from "./roomIcons";
import Skull from "./Skull.svelte";
import Gamepad from "./Gamepad.svelte";

describe("resolveRoomIcon", () => {
  it("resolve chaves temáticas", () => {
    expect(resolveRoomIcon("icon:skull")).toBe(Skull);
    expect(resolveRoomIcon("icon:gamepad")).toBe(Gamepad);
  });

  it("URL de imagem não vira ícone temático", () => {
    expect(resolveRoomIcon("/brand/x.png")).toBeUndefined();
  });

  it("chave desconhecida retorna undefined (fallback de iniciais)", () => {
    expect(resolveRoomIcon(`${ROOM_ICON_SCHEME}caveira`)).toBeUndefined();
  });

  it("chaves herdadas de Object.prototype não resolvem (Map)", () => {
    expect(resolveRoomIcon("icon:constructor")).toBeUndefined();
    expect(resolveRoomIcon("icon:hasOwnProperty")).toBeUndefined();
  });

  it("icon ausente retorna undefined", () => {
    expect(resolveRoomIcon(undefined)).toBeUndefined();
  });
});

describe("isIconUrl — img só recebe URL real", () => {
  it("URL passa", () => {
    expect(isIconUrl("/brand/x.png")).toBe(true);
    expect(isIconUrl("https://cdn.discordapp.com/x.png")).toBe(true);
  });

  it("scheme icon: nunca vira <img> — chave desconhecida cai em iniciais", () => {
    expect(isIconUrl("icon:skull")).toBe(false);
    expect(isIconUrl("icon:caveira")).toBe(false);
    expect(isIconUrl("icon:")).toBe(false);
  });

  it("icon ausente não é URL", () => {
    expect(isIconUrl(undefined)).toBe(false);
  });
});
