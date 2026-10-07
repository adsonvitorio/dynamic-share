import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import { ErrorCodes } from "@share/shared";
import { AppError, errors } from "../src/core/http/errors.js";
import { appErrorHandler } from "../src/core/http/error-handler.js";

// App real com o handler real de app.ts — nenhuma réplica.
function makeApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(appErrorHandler);
  return app;
}

describe("AppError", () => {
  it("carrega statusCode, code e message", () => {
    const e = new AppError(403, ErrorCodes.NOT_AUTHORIZED, "negado");
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe("not_authorized");
    expect(e.message).toBe("negado");
    expect(e.name).toBe("AppError");
    expect(e instanceof Error).toBe(true);
  });

  it("factories produzem code/status coerentes", () => {
    expect(errors.unauthorized().statusCode).toBe(401);
    expect(errors.sessionReplaced().code).toBe("session_replaced");
    expect(errors.forbidden().statusCode).toBe(403);
    expect(errors.notFound().statusCode).toBe(404);
    expect(errors.paused().statusCode).toBe(503);
    expect(errors.paused().code).toBe("paused");
    expect(errors.webhookInvalid().statusCode).toBe(401);
    expect(errors.rateLimited().statusCode).toBe(429);
    expect(errors.rateLimited().code).toBe("rate_limited");
    expect(errors.internal().statusCode).toBe(500);
  });
});

describe("appErrorHandler (real)", () => {
  it("AppError → {error, message} com o status certo", async () => {
    const app = makeApp();
    app.get("/x", () => {
      throw errors.paused();
    });
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: "paused",
      message: "Aplicação pausada temporariamente.",
    });
  });

  it("ZodError → 400 bad_request (branch real do handler)", async () => {
    const app = makeApp();
    app.get("/x", () => {
      throw new ZodError([
        {
          code: "invalid_type",
          expected: "string",
          path: ["room"],
          message: "Required",
        },
      ]);
    });
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "bad_request",
      message: "Parâmetros inválidos.",
    });
  });

  it("schema.parse falha → mesmo caminho ZodError", async () => {
    const app = makeApp();
    const schema = z.object({ room: z.string().min(1) });
    app.get("/x", () => schema.parse({}));
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("bad_request");
  });

  it("erro com statusCode 4xx → bad_request com o status preservado", async () => {
    const app = makeApp();
    app.get("/x", () => {
      const err = new Error("teapot") as Error & { statusCode: number };
      err.statusCode = 418;
      throw err;
    });
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(418);
    expect(res.json().error).toBe("bad_request");
  });

  it("throw de primitivo/null → 500 (handler não quebra)", async () => {
    const app = makeApp();
    app.get("/x", () => {
      throw null;
    });
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("internal_error");
  });

  it("erro genérico → 500 sem vazar internals", async () => {
    const app = makeApp();
    app.get("/x", () => {
      throw new Error("db connection string leaked");
    });
    const res = await app.inject({ url: "/x" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("db connection string");
  });
});
