import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { SessionPayload } from "@share/shared";
import { COOKIES, PUBLIC_PATHS } from "../../core/config/constants.js";
import { errors } from "../../core/http/errors.js";
import type { AuthService } from "./service.js";
import { sessionCookieOptions } from "./cookies.js";

declare module "fastify" {
  interface FastifyRequest {
    session: SessionPayload | null;
    newSessionCookie: string | null;
  }
}

export interface AuthPluginOptions {
  service: AuthService;
  production: boolean;
  sessionMaxDays: number;
}

async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  app.decorateRequest("session", null);
  app.decorateRequest("newSessionCookie", null);

  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/api/")) return;
    const pathOnly = req.url.split("?")[0];
    if ((PUBLIC_PATHS as readonly string[]).includes(pathOnly)) return;

    if (await app.appState.isPaused()) {
      throw errors.paused();
    }

    const raw = req.cookies[COOKIES.SESSION];
    if (!raw) throw errors.unauthorized();
    // /api/events usa hijack — onSend nunca roda, um refresh aqui perderia o
    // refresh_token rotacionado (cookie novo não chegaria ao cliente).
    const result = await opts.service.validate(raw, app.appConfig, {
      refresh: pathOnly !== "/api/events",
    });
    if (!result.ok) {
      throw result.reason === "replaced" ? errors.sessionReplaced() : errors.unauthorized();
    }
    req.session = result.session;
    if (result.newCookie) req.newSessionCookie = result.newCookie;
  });

  app.addHook("onSend", async (req, reply) => {
    if (req.newSessionCookie) {
      reply.setCookie(
        COOKIES.SESSION,
        req.newSessionCookie,
        sessionCookieOptions(opts.production, opts.sessionMaxDays * 86400),
      );
    }
  });
}

export default fp(authPlugin, { name: "auth" });
