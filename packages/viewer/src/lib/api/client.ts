import type { ApiError } from "@share/shared";
import { API } from "$lib/constants";
import { createLogger } from "$lib/utils/logger";

const log = createLogger("Api");

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      signal: controller.signal,
      ...init,
    });
    if (res.ok) {
      try {
        return { ok: true, data: (await res.json()) as T };
      } catch {
        log.warn("ok_body_parse_failed", path, res.status);
        return {
          ok: false,
          error: {
            error: "bad_response",
            message: "Resposta inválida do servidor.",
          },
        };
      }
    }
    let error: ApiError;
    try {
      const body = (await res.json()) as Partial<ApiError>;
      error = {
        error: typeof body.error === "string" ? body.error : "unknown",
        message: typeof body.message === "string" ? body.message : "Erro inesperado.",
      };
    } catch {
      error = { error: "http_" + res.status, message: "Erro de comunicação com o servidor." };
      log.warn("error_body_parse_failed", path, res.status);
    }
    return { ok: false, error };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    log.warn("request_failed", path, aborted ? "timeout" : err);
    return {
      ok: false,
      error: {
        error: aborted ? "timeout" : "network",
        message: aborted ? "O servidor demorou para responder." : "Falha de conexão com o servidor.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};
