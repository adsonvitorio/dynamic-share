import type { FastifyInstance } from "fastify";
import { tokenRoomQuerySchema } from "@share/shared";
import { RATE_LIMIT } from "../core/config/constants.js";
import { errors } from "../core/http/errors.js";
import { createLogger } from "../core/logging/logger.js";
import type { AuthService } from "../modules/auth/service.js";
import type { RoomsService } from "../modules/rooms/service.js";
import type { LiveKitService } from "../modules/streaming/livekit.js";
import { identityForSub, isValidRoomName } from "../modules/streaming/names.js";
import type { PresenceService } from "../modules/streaming/presence.js";

const log = createLogger("Token");

interface TokenRouteDeps {
  auth: AuthService;
  rooms: RoomsService;
  livekit: LiveKitService;
  presence: PresenceService;
}

export function tokenRoutes(app: FastifyInstance, deps: TokenRouteDeps): void {
  app.get("/api/token", { config: { rateLimit: RATE_LIMIT.TOKEN } }, async (req) => {
    const parsed = tokenRoomQuerySchema.safeParse(req.query);
    if (!parsed.success) throw errors.invalidInput();
    const session = req.session;
    if (!session) throw errors.unauthorized();

    const room = await deps.rooms.get(parsed.data.room);
    const livekitName = room.name;

    let snapshot;
    try {
      snapshot = await deps.livekit.ensureRoom(livekitName);
    } catch (err) {
      log.error("ensure_room_failed", { err, room: livekitName });
      throw errors.unavailable();
    }
    deps.presence.reconcile(snapshot);
    // Reconcilia occupants/sharers do estado real — webhook de leave
    // perdido deixava a pessoa "presa" no hub; restart do server perdia
    // occupants até o próximo join. Fire-and-forget: o token não espera
    // Twirp extra, e o próximo token/refresh refaz o sync.
    for (const summary of snapshot) {
      if (!isValidRoomName(summary.name) || summary.numParticipants === 0) continue;
      void Promise.resolve()
        .then(() => deps.livekit.listParticipants(summary.name))
        .then((participants) => deps.presence.syncRoom(summary.name, participants))
        .catch((err) => log.warn("presence_sync_failed", { room: summary.name, err }));
    }

    const identity = identityForSub(session.sub);
    const ttlSec = Math.max(
      1,
      Math.min(deps.auth.sessionRemainingSec(session), app.appConfig.livekitTokenTtlSec),
    );

    try {
      const token = await deps.livekit.generateToken({
        room: livekitName,
        identity,
        name: session.name,
        metadata: JSON.stringify({ avatarUrl: session.avatarUrl }),
        ttlSec,
      });
      return { token, url: app.appConfig.publicLivekitUrl };
    } catch (err) {
      log.error("token_generate_failed", { err, room: livekitName });
      throw errors.unavailable();
    }
  });
}
