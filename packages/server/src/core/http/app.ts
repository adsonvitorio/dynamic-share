import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { RATE_LIMIT } from "../config/constants.js";
import type { AppEnv } from "../config/env.js";
import type { AppConfig } from "../config/app.js";
import { errors } from "./errors.js";
import { appErrorHandler } from "./error-handler.js";
import { createLogger } from "../logging/logger.js";
import appPlugin from "../../modules/app/plugin.js";
import authPlugin from "../../modules/auth/plugin.js";
import { healthRoutes } from "../../routes/health.js";
import { statusRoutes } from "../../routes/status.js";
import { roomRoutes } from "../../routes/rooms.js";
import { authRoutes } from "../../routes/auth.js";
import { eventRoutes } from "../../routes/events.js";
import { tokenRoutes } from "../../routes/token.js";
import { webhookRoutes } from "../../routes/webhook.js";
import type { RoomsService } from "../../modules/rooms/service.js";
import type { AuthService } from "../../modules/auth/service.js";
import type { SessionEvents } from "../../modules/auth/session-events.js";
import type { LiveKitService } from "../../modules/streaming/livekit.js";
import type { PresenceService } from "../../modules/streaming/presence.js";

export interface AppDeps {
  env: AppEnv;
  config: AppConfig;
  rooms: RoomsService;
  auth: AuthService;
  events: SessionEvents;
  livekit: LiveKitService;
  presence: PresenceService;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env, config } = deps;

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["x-api-key"]',
          "res.headers['set-cookie']",
        ],
        remove: true,
      },
    },
    trustProxy: env.PRODUCTION,
    disableRequestLogging: true,
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler(appErrorHandler);

  // Access log — sem request.url cru: a query carrega segredos (code/state
  // do OAuth). routeOptions.url dá o pattern da rota; 404s caem no path
  // sem query. /health e preflights são ruído de infra.
  const httpLog = createLogger("HTTP");
  app.addHook("onResponse", (request, reply, done) => {
    const path = request.routeOptions?.url ?? request.url.split("?")[0];
    if (path === "/health" || request.method === "OPTIONS") return done();
    const fields = {
      method: request.method,
      path,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    };
    if (reply.statusCode >= 500) httpLog.warn("request", fields);
    else httpLog.info("request", fields);
    done();
  });

  app.setNotFoundHandler((req, reply) => {
    const e = errors.notFound();
    return reply.status(404).send({ error: e.code, message: e.message });
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: [config.viewerUrl],
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT.GLOBAL.max,
    timeWindow: RATE_LIMIT.GLOBAL.timeWindow,
    // O plugin throwa o retorno do builder — precisa ser um AppError real
    // para o errorHandler devolver 429 + code próprio (objeto plano cairia
    // no fallback 500).
    errorResponseBuilder: () => errors.rateLimited(),
  });
  await app.register(appPlugin, {
    config: config,
    stateDir: path.join(env.DATA_DIR, "state"),
  });
  await app.register(authPlugin, {
    service: deps.auth,
    production: env.PRODUCTION,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
  });

  healthRoutes(app);
  statusRoutes(app);
  roomRoutes(app, deps.rooms, deps.presence);
  authRoutes(app, {
    service: deps.auth,
    production: env.PRODUCTION,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
  });
  eventRoutes(app, deps.events, deps.presence);
  tokenRoutes(app, deps);
  webhookRoutes(app, deps);

  return app;
}
