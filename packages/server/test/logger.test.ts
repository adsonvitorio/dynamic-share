import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/core/logging/logger.js";

describe("redactSecrets", () => {
  it("redige valor de cookie session", () => {
    const out = redactSecrets("cookie: session=abcdef1234567890abcdef");
    expect(out).not.toContain("abcdef1234567890abcdef");
    expect(out).toContain("<redacted>");
  });

  it("redige padrão de token Discord", () => {
    const out = redactSecrets("token abcdefghijklmnopqrstuvwx.ABCDEF.MTIzNDU2Nzg5MGFiY2RlZmdoaWprbA");
    expect(out).not.toContain("MTIzNDU2Nzg5MGFiY2RlZmdoaWprbA");
  });

  it("não altera texto comum", () => {
    expect(redactSecrets("listening on 8080")).toBe("listening on 8080");
  });
});
