import { afterEach, describe, expect, it, vi } from "vitest";
import { API } from "$lib/constants";
import { api } from "./client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("api.get", () => {
  it("resposta 2xx → { ok:true, data }", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { hello: 1 }));
    const res = await api.get<{ hello: number }>("/x");
    expect(res).toEqual({ ok: true, data: { hello: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/x",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("2xx com corpo não-JSON → bad_response (não 'network')", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: {
        error: "bad_response",
        message: "Resposta inválida do servidor.",
      },
    });
  });

  it("non-2xx com corpo {error,message} → preserva erro do backend", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: "session_replaced", message: "trocou" }),
    );
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: { error: "session_replaced", message: "trocou" },
    });
  });

  it("non-2xx com shape parcial → defaults seguros", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 42 }));
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: { error: "unknown", message: "Erro inesperado." },
    });
  });

  it("non-2xx com corpo não-JSON → http_<status>", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops", { status: 502 }));
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: { error: "http_502", message: "Erro de comunicação com o servidor." },
    });
  });

  it("rede cai (fetch rejeita) → error 'network'", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: { error: "network", message: "Falha de conexão com o servidor." },
    });
  });

  it("abort/timeout → error 'timeout'", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const res = await api.get("/x");
    expect(res).toEqual({
      ok: false,
      error: { error: "timeout", message: "O servidor demorou para responder." },
    });
  });

  it("dispara AbortController após FETCH_TIMEOUT_MS (prova que o timer existe)", async () => {
    vi.useFakeTimers();
    try {
      // Fetch que só rejeita quando o signal dispara — se o AbortController
      // for removido, a promise nunca resolve e o teste falha por timeout.
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal?.addEventListener("abort", () =>
              rej(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const promise = api.get("/x");
      await vi.advanceTimersByTimeAsync(API.FETCH_TIMEOUT_MS + 1);
      const res = await promise;
      expect(res).toEqual({
        ok: false,
        error: {
          error: "timeout",
          message: "O servidor demorou para responder.",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("api.post", () => {
  it("envia JSON com content-type quando body presente", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api.post("/x", { a: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/x",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"a":1}',
      }),
    );
  });

  it("sem body → sem headers/body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api.post("/x");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });
});
