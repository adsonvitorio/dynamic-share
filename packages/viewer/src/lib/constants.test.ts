import { describe, expect, it } from "vitest";
import { copy } from "./constants";

describe("copy", () => {
  it("expõe a copy gamer da app", () => {
    expect(copy.membersTitle).toBe("Squad");
    expect(copy.logout).toBe("Sair");
    expect(copy.joinHint).toBe("Entrar");
    expect(copy.stageEmptyTitle).toBe("Nenhuma transmissão por aqui");
    expect(copy.roomsTitle).toBe("Salas");
  });

  it("cobre todas as loginReasons do schema compartilhado", () => {
    expect(copy.loginReasons.logged_out).toBe("Você saiu da conta.");
    expect(copy.loginReasons.unavailable).toBe("O serviço está indisponível. Tente em instantes.");
    expect(copy.statusLostTitle).toBe("Conexão perdida");
    expect(copy.statusErrorTitle).toBe("Algo deu errado");
  });
});
