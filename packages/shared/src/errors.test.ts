import { describe, expect, it } from "vitest";
import { ErrorCodes } from "./errors";

describe("ErrorCodes", () => {
  it("valores são únicos", () => {
    const values = Object.values(ErrorCodes);
    expect(new Set(values).size).toBe(values.length);
  });

  it("valores são snake_case minúsculo", () => {
    for (const v of Object.values(ErrorCodes)) {
      expect(v).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });

  it("chaves do objeto batem com o valor em UPPER_SNAKE", () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(key.toLowerCase()).toBe(value);
    }
  });

  it("códigos críticos existem", () => {
    expect(ErrorCodes.INVALID_ROOM).toBe("invalid_room");
    expect(ErrorCodes.SESSION_REPLACED).toBe("session_replaced");
    expect(ErrorCodes.NOT_AUTHORIZED).toBe("not_authorized");
    expect(ErrorCodes.TOKEN_EXPIRED).toBe("token_expired");
  });
});
