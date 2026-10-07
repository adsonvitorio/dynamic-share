import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthMeResponse } from "@share/shared";
import { COOKIES, RATE_LIMIT } from "../core/config/constants.js";
import { errors } from "../core/http/errors.js";
import { sessionCookieOptions, stateCookieOptions } from "../modules/auth/cookies.js";
import type { AuthService } from "../modules/auth/service.js";

const loginQuerySchema = z.object({
  path: z.string().max(512).optional(),
  redirect: z.string().max(512).optional(),
});
const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export interface AuthRouteOptions {
  service: AuthService;
  production: boolean;
  sessionMaxDays: number;
}

export function authRoutes(app: FastifyInstance, opts: AuthRouteOptions): void {
  const sessionOpts = sessionCookieOptions(opts.production, opts.sessionMaxDays * 86400);

  app.get(
    "/api/auth/discord/login",
    { config: { rateLimit: RATE_LIMIT.AUTH } },
    async (req, reply) => {
      const { path, redirect } = loginQuerySchema.parse(req.query);
      const { location, stateCookie } = opts.service.buildLoginRedirect(
        app.appConfig,
        path ?? redirect,
      );
      reply.setCookie(COOKIES.OAUTH_STATE, stateCookie, stateCookieOptions(opts.production));
      return reply.redirect(location);
    },
  );

  app.get(
    "/api/auth/discord/callback",
    { config: { rateLimit: RATE_LIMIT.AUTH } },
    async (req, reply) => {
      const query = callbackQuerySchema.parse(req.query);
      const result = await opts.service.handleCallback(
        app.appConfig,
        query,
        req.cookies[COOKIES.OAUTH_STATE],
      );
      reply.clearCookie(COOKIES.OAUTH_STATE, { path: "/" });
      if (!result.ok) return reply.redirect(result.redirect);
      reply.setCookie(COOKIES.SESSION, result.cookie, sessionOpts);
      return reply.redirect(result.redirect);
    },
  );

  app.get("/api/auth/me", async (req): Promise<AuthMeResponse> => {
    const session = req.session;
    if (!session) throw errors.unauthorized();
    return {
      authenticated: true,
      user: { id: session.sub, name: session.name, avatarUrl: session.avatarUrl },
    };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.session) opts.service.logout(req.session);
    reply.clearCookie(COOKIES.SESSION, { path: "/" });
    return { ok: true };
  });
}
