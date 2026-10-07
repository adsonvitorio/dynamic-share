import type { CookieSerializeOptions } from "@fastify/cookie";
import { COOKIES } from "../../core/config/constants.js";

const base = (production: boolean): CookieSerializeOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: production,
  path: "/",
});

export function sessionCookieOptions(
  production: boolean,
  maxAgeSec: number,
): CookieSerializeOptions {
  return { ...base(production), maxAge: maxAgeSec };
}

export function stateCookieOptions(production: boolean): CookieSerializeOptions {
  return { ...base(production), maxAge: COOKIES.OAUTH_STATE_TTL_SEC };
}
