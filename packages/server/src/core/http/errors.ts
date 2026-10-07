import type { ErrorCode } from "@share/shared";
import { ErrorCodes } from "@share/shared";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    userMessage: string,
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}

export const errors = {
  badRequest: (message = "Requisição inválida.") =>
    new AppError(400, ErrorCodes.BAD_REQUEST, message),
  invalidInput: (message = "Parâmetro inválido.") =>
    new AppError(400, ErrorCodes.INVALID_INPUT, message),
  webhookInvalid: () =>
    new AppError(401, ErrorCodes.WEBHOOK_INVALID, "Webhook inválido."),
  unauthorized: (message = "Sua sessão expirou. Faça login novamente.") =>
    new AppError(401, ErrorCodes.SESSION_EXPIRED, message),
  sessionReplaced: () =>
    new AppError(401, ErrorCodes.SESSION_REPLACED, "Sua conta foi acessada em outro local."),
  forbidden: (message = "Você não tem permissão para acessar.") =>
    new AppError(403, ErrorCodes.NOT_AUTHORIZED, message),
  notFound: (message = "Recurso não encontrado.") =>
    new AppError(404, ErrorCodes.INVALID_ROOM, message),
  roomNotFound: () =>
    new AppError(404, ErrorCodes.INVALID_ROOM, "Sala não encontrada."),
  paused: () =>
    new AppError(503, ErrorCodes.PAUSED, "Aplicação pausada temporariamente."),
  rateLimited: () =>
    new AppError(429, ErrorCodes.RATE_LIMITED, "Muitas requisições. Aguarde um instante."),
  unavailable: (message = "Serviço indisponível no momento. Tente novamente em instantes.") =>
    new AppError(503, ErrorCodes.UNAVAILABLE, message),
  internal: () =>
    new AppError(500, ErrorCodes.INTERNAL_ERROR, "Ocorreu um erro interno. Tente novamente."),
};
