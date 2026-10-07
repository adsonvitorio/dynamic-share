import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, errors } from "./errors.js";
import { createLogger } from "../logging/logger.js";

const log = createLogger("Http");

export function appErrorHandler(
  err: unknown,
  req: FastifyRequest,
  reply: FastifyReply,
): unknown {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message });
  }
  if (err instanceof ZodError) {
    const e = errors.badRequest("Parâmetros inválidos.");
    return reply.status(e.statusCode).send({ error: e.code, message: e.message });
  }
  const statusCode =
    typeof err === "object" && err !== null
      ? (err as { statusCode?: unknown }).statusCode
      : undefined;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    const e = errors.badRequest();
    return reply.status(statusCode).send({ error: e.code, message: e.message });
  }
  log.error("unhandled_error", { err, rid: req.id, url: req.url });
  const e = errors.internal();
  return reply.status(500).send({ error: e.code, message: e.message });
}
