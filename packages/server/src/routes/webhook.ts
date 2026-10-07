import type { FastifyInstance } from "fastify";
import { LIVEKIT, RATE_LIMIT } from "../core/config/constants.js";
import { errors } from "../core/http/errors.js";
import { createLogger } from "../core/logging/logger.js";
import { maskedId } from "../core/logging/pii.js";
import type { AuthService } from "../modules/auth/service.js";
import type { LiveKitService } from "../modules/streaming/livekit.js";
import type { PresenceService } from "../modules/streaming/presence.js";

const log = createLogger("Webhook");

interface WebhookDeps {
  auth: AuthService;
  livekit: LiveKitService;
  presence: PresenceService;
}

export function webhookRoutes(app: FastifyInstance, deps: WebhookDeps): void {
  app.addContentTypeParser(
    LIVEKIT.WEBHOOK_CONTENT_TYPE,
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/webhook", { config: { rateLimit: RATE_LIMIT.WEBHOOK } }, async (req) => {
    const body = req.body;
    if (!Buffer.isBuffer(body)) throw errors.webhookInvalid();

    let event;
    try {
      event = await deps.livekit.verifyWebhook(body, req.headers.authorization);
    } catch {
      throw errors.webhookInvalid();
    }

    // Gate de join: JWT emitido antes de logout/expiração/revogação segue
    // válido até o exp — sem este check o token continuaria reentrando.
    // Identity sem sessão viva no registry é removida na hora.
    if (
      event.event === "participant_joined" &&
      event.room?.name &&
      event.participant?.identity &&
      !deps.auth.isLiveIdentity(event.participant.identity)
    ) {
      log.info("join_denied_no_session", {
        room: event.room.name,
        identity: maskedId(event.participant.identity),
      });
      void deps.livekit.removeParticipantFrom(
        event.room.name,
        event.participant.identity,
      );
    }

    try {
      deps.presence.handleEvent(event);
    } catch (err) {
      // Assinatura válida = não retransmitir; falha interna vira só log —
      // o próximo evento ou o reconcile do /api/token ressincroniza.
      log.error("webhook_handle_failed", { err });
    }

    return { ok: true };
  });
}
