import { describe, expect, it } from "vitest";
import { devConfigBody } from "../src/dev-livekit.js";

describe("devConfigBody", () => {
  it("configura webhook apontando para a rota /webhook do server local", () => {
    const body = devConfigBody("devkey", "devsecret", "http://localhost:8080/webhook");
    expect(body).toContain("webhook:");
    expect(body).toContain('api_key: "devkey"');
    expect(body).toContain('- "http://localhost:8080/webhook"');
  });

  it("registra o par key/secret usado pelo server para assinar tokens", () => {
    const body = devConfigBody("devkey", "devsecret", "http://localhost:8080/webhook");
    expect(body).toContain('"devkey": "devsecret"');
  });
});
