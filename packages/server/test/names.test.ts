import { describe, expect, it } from "vitest";
import { isValidRoomName } from "../src/modules/streaming/names.js";

describe("isValidRoomName", () => {
  it("aceita slugs válidos", () => {
    for (const name of ["sala-a", "geral", "a1-b2"]) {
      expect(isValidRoomName(name)).toBe(true);
    }
  });

  it("rejeita slugs fora do regex e acima do limite", () => {
    for (const name of ["Sala", "sala_a", "sala a", "", "x".repeat(64)]) {
      expect(isValidRoomName(name)).toBe(false);
    }
  });
});
