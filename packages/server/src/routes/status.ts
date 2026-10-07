import type { FastifyInstance } from "fastify";
import { appStateSchema, type AppState } from "@share/shared";

export function statusRoutes(app: FastifyInstance): void {
  app.get("/api/status", async (): Promise<AppState> => {
    const paused = await app.appState.isPaused();
    return appStateSchema.parse({ paused });
  });
}
