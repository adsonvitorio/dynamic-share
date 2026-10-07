import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./core/config/env.js";
import { SESSION } from "./core/config/constants.js";
import { buildAppConfig } from "./core/config/app.js";
import { setLogLevel, createLogger } from "./core/logging/logger.js";
import { buildApp } from "./core/http/app.js";
import { registerShutdown } from "./core/lifecycle/shutdown.js";
import { RoomsService } from "./modules/rooms/service.js";
import { SessionCrypto } from "./modules/auth/crypto.js";
import { SessionRegistry } from "./modules/auth/session-registry.js";
import { SessionEvents } from "./modules/auth/session-events.js";
import { DiscordClient } from "./modules/auth/discord.js";
import { createAuthorizer } from "./modules/auth/authorizers/index.js";
import { AuthService } from "./modules/auth/service.js";
import { LiveKitService } from "./modules/streaming/livekit.js";
import { identityForSub } from "./modules/streaming/names.js";
import { PresenceService } from "./modules/streaming/presence.js";

const log = createLogger("Server");

async function main(): Promise<void> {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);

  await mkdir(path.join(env.DATA_DIR), { recursive: true });

  const config = buildAppConfig(env);
  const rooms = new RoomsService(config);

  const crypto = new SessionCrypto(env.SESSION_SECRET);
  const registry = await SessionRegistry.load(
    path.join(env.DATA_DIR, SESSION.SNAPSHOT_FILE),
  );
  const events = new SessionEvents();
  const discord = new DiscordClient();
  const authorizer = createAuthorizer(config);
  const livekit = new LiveKitService(
    env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
    env.ROOM_EMPTY_TIMEOUT_SEC,
  );
  const auth = new AuthService({
    crypto,
    registry,
    events,
    discord,
    authorizer,
    sessionMaxDays: env.SESSION_MAX_DURATION_DAYS,
    onSessionTerminated: (sub) => void livekit.kickParticipant(identityForSub(sub)),
  });
  const presence = new PresenceService(events, (room) => livekit.listParticipants(room));

  const app = await buildApp({ env, config, rooms, auth, events, livekit, presence });

  registerShutdown(app, async () => {
    events.closeAll();
    await registry.persist();
  });

  await app.listen({ host: env.HOST, port: env.PORT });
  log.info("listening", { host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  log.error("boot_failed", { err });
  process.exit(1);
});
