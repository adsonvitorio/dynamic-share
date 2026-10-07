import type { FastifyInstance } from "fastify";

export function healthRoutes(app: FastifyInstance): void {
  app.get("/health", () => ({ ok: true, ts: Date.now() }));
}
