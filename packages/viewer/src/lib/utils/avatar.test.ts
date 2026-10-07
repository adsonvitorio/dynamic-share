import { describe, expect, it } from "vitest";
import { parseAvatarUrl } from "./avatar";

describe("parseAvatarUrl", () => {
  it("retorna URL do CDN do Discord", () => {
    const url = "https://cdn.discordapp.com/avatars/123/abc.png";
    expect(parseAvatarUrl(JSON.stringify({ avatarUrl: url }))).toBe(url);
  });

  it("rejeita URL fora do CDN do Discord", () => {
    const evil = JSON.stringify({ avatarUrl: "https://evil.com/x.png" });
    expect(parseAvatarUrl(evil)).toBeNull();
    expect(parseAvatarUrl(JSON.stringify({ avatarUrl: "javascript:alert(1)" }))).toBeNull();
  });

  it("retorna null para metadata ausente/inválida", () => {
    expect(parseAvatarUrl(undefined)).toBeNull();
    expect(parseAvatarUrl("not json")).toBeNull();
    expect(parseAvatarUrl("42")).toBeNull();
    expect(parseAvatarUrl("null")).toBeNull();
    expect(parseAvatarUrl("{}")).toBeNull();
    expect(parseAvatarUrl(JSON.stringify({ avatarUrl: 42 }))).toBeNull();
  });
});
