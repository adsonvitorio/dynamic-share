import type { FastifyInstance } from "fastify";
import { createLogger } from "../logging/logger.js";

const log = createLogger("Lifecycle");

export function registerShutdown(
  app: FastifyInstance,
  onShutdown: () => Promise<void> | void,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutdown_started", { signal });
    try {
      await onShutdown();
      await app.close();
      log.info("shutdown_complete", { signal });
      process.exit(0);
    } catch (err) {
      log.error("shutdown_failed", { signal, err });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled_rejection", { err: reason instanceof Error ? reason : new Error(String(reason)) });
  });
  process.on("uncaughtException", (err) => {
    log.error("uncaught_exception", { err });
    void shutdown("uncaught_exception");
  });
}
