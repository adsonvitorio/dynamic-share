import { describe, expect, it } from "vitest";
import {
  sessionCookieOptions,
  stateCookieOptions,
} from "../src/modules/auth/cookies.js";
import { COOKIES } from "../src/core/config/constants.js";

describe("cookie options", () => {
  it("flags de segurança sempre ligadas", () => {
    for (const prod of [true, false]) {
      for (const opts of [sessionCookieOptions(prod, 60), stateCookieOptions(prod)]) {
        expect(opts.httpOnly).toBe(true);
        expect(opts.sameSite).toBe("lax");
        expect(opts.path).toBe("/");
      }
    }
  });

  it("secure segue production", () => {
    expect(sessionCookieOptions(true, 60).secure).toBe(true);
    expect(sessionCookieOptions(false, 60).secure).toBe(false);
    expect(stateCookieOptions(true).secure).toBe(true);
    expect(stateCookieOptions(false).secure).toBe(false);
  });

  it("session cookie usa o maxAge configurado", () => {
    expect(sessionCookieOptions(true, 2592000).maxAge).toBe(2592000);
  });

  it("state cookie usa o TTL de OAuth state", () => {
    expect(stateCookieOptions(true).maxAge).toBe(COOKIES.OAUTH_STATE_TTL_SEC);
    expect(COOKIES.OAUTH_STATE_TTL_SEC).toBeGreaterThan(0);
  });
});
