import type { FastifyInstance } from "fastify";
import { errors } from "../core/http/errors.js";
import type { SessionEvents } from "../modules/auth/session-events.js";
import type { PresenceService } from "../modules/streaming/presence.js";

export function eventRoutes(
  app: FastifyInstance,
  events: SessionEvents,
  presence: PresenceService,
): void {
  app.get("/api/events", (req, reply) => {
    const session = req.session;
    if (!session) throw errors.unauthorized();
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Cada subscribe (inclui reconnect e volta de foco) é um gatilho de
    // heal: quem assiste o hub sana presença cujos webhooks se perderam.
    presence.syncAll();
    events.add(session.jti, reply.raw);
  });
}
