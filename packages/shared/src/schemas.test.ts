import { describe, expect, it } from "vitest";
import {
  SHARED_LIMITS,
  allowlistSchema,
  discordTokenResponseSchema,
  discordUserSchema,
  discordRefreshResponseSchema,
  loginReasonSchema,
  occupantSchema,
  appStateSchema,
  roomConfigSchema,
  roomPresenceSchema,
  roomsConfigSchema,
  roomsResponseSchema,
  sseEventSchema,
  tokenResponseSchema,
  tokenRoomQuerySchema,
} from "./schemas";

const validRoom = { name: "sala-a", displayName: "Sala A" };

describe("SHARED_LIMITS invariants", () => {
  it("regex ancorada: aceita slug válido e rejeita o resto", () => {
    expect(SHARED_LIMITS.ROOM_NAME_REGEX.test("sala-a1")).toBe(true);
    expect(SHARED_LIMITS.ROOM_NAME_REGEX.test("Sala")).toBe(false);
    expect(SHARED_LIMITS.ROOM_NAME_REGEX.test("sala_a")).toBe(false);
    expect(SHARED_LIMITS.ROOM_NAME_REGEX.test("sala a")).toBe(false);
    expect(SHARED_LIMITS.ROOM_NAME_REGEX.test("")).toBe(false);
  });

  it("limites são positivos e ordenados", () => {
    expect(SHARED_LIMITS.ROOM_NAME_MAX_LENGTH).toBeGreaterThan(0);
    expect(SHARED_LIMITS.DISPLAY_NAME_MAX_LENGTH).toBeGreaterThan(0);
    expect(SHARED_LIMITS.ROOM_MAX_COUNT).toBeGreaterThan(0);
  });
});

describe("roomConfigSchema", () => {
  it("aceita sala válida mínima", () => {
    expect(roomConfigSchema.safeParse(validRoom).success).toBe(true);
  });

  it("aceita campos opcionais", () => {
    const r = roomConfigSchema.safeParse({
      ...validRoom,
      description: "d",
      icon: "🎥",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita name inválido, vazio e acima do max", () => {
    for (const name of ["Sala", "sala_a", "", "a".repeat(51)]) {
      expect(roomConfigSchema.safeParse({ ...validRoom, name }).success).toBe(
        false,
      );
    }
  });

  it("rejeita displayName vazio e acima do max", () => {
    expect(
      roomConfigSchema.safeParse({ ...validRoom, displayName: "" }).success,
    ).toBe(false);
    expect(
      roomConfigSchema.safeParse({
        ...validRoom,
        displayName: "x".repeat(33),
      }).success,
    ).toBe(false);
    expect(
      roomConfigSchema.safeParse({
        ...validRoom,
        displayName: "x".repeat(32),
      }).success,
    ).toBe(true);
  });

  it("rejeita description acima de 200", () => {
    expect(
      roomConfigSchema.safeParse({
        ...validRoom,
        description: "d".repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe("roomsConfigSchema", () => {
  it("aceita lista válida", () => {
    expect(
      roomsConfigSchema.safeParse([
        validRoom,
        { name: "sala-b", displayName: "Sala B" },
      ]).success,
    ).toBe(true);
  });

  it("rejeita nomes duplicados", () => {
    expect(
      roomsConfigSchema.safeParse([
        validRoom,
        { name: "sala-a", displayName: "Outra" },
      ]).success,
    ).toBe(false);
  });

  it("rejeita lista acima do max", () => {
    const rooms = Array.from({ length: 101 }, (_, i) => ({
      name: `sala-${i}`,
      displayName: `S${i}`,
    }));
    expect(roomsConfigSchema.safeParse(rooms).success).toBe(false);
    expect(roomsConfigSchema.safeParse(rooms.slice(0, 100)).success).toBe(true);
  });
});

describe("allowlistSchema", () => {
  it("aceita ids de 10-25 dígitos", () => {
    expect(allowlistSchema.safeParse(["1234567890"]).success).toBe(true);
    expect(allowlistSchema.safeParse(["1".repeat(25)]).success).toBe(true);
  });

  it("rejeita id curto, com letra e vazio", () => {
    for (const id of ["123456789", "123456789a", ""]) {
      expect(allowlistSchema.safeParse([id]).success).toBe(false);
    }
  });

  it("rejeita id acima de 25 dígitos", () => {
    expect(allowlistSchema.safeParse(["1".repeat(26)]).success).toBe(false);
  });
});

describe("appStateSchema", () => {
  it("aceita paused boolean; rejeita ausente/string", () => {
    expect(appStateSchema.safeParse({ paused: true }).success).toBe(true);
    expect(appStateSchema.safeParse({}).success).toBe(false);
    expect(appStateSchema.safeParse({ paused: "yes" }).success).toBe(false);
  });
});

describe("discord schemas", () => {
  it("token response exige access/refresh/expires_in", () => {
    const ok = {
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
    };
    expect(discordTokenResponseSchema.safeParse(ok).success).toBe(true);
    expect(discordRefreshResponseSchema.safeParse(ok).success).toBe(true);
    expect(
      discordTokenResponseSchema.safeParse({ ...ok, expires_in: "1h" })
        .success,
    ).toBe(false);
    expect(
      discordRefreshResponseSchema.safeParse({ access_token: "a" }).success,
    ).toBe(false);
  });

  it("discordUser exige id snowflake; global_name/avatar opcionais", () => {
    const u = { id: "123456789012345678", username: "nick" };
    expect(discordUserSchema.safeParse(u).success).toBe(true);
    expect(
      discordUserSchema.safeParse({ ...u, global_name: null, avatar: null })
        .success,
    ).toBe(true);
    expect(discordUserSchema.safeParse({ ...u, id: "abc" }).success).toBe(
      false,
    );
  });
});

describe("loginReasonSchema", () => {
  it("aceita valores do enum e rejeita fora", () => {
    expect(loginReasonSchema.safeParse("session_replaced").success).toBe(true);
    expect(loginReasonSchema.safeParse("bogus").success).toBe(false);
  });
});

describe("tokenRoomQuerySchema", () => {
  it("valida room pelo mesmo regex/limite", () => {
    expect(tokenRoomQuerySchema.safeParse({ room: "sala-a" }).success).toBe(
      true,
    );
    expect(tokenRoomQuerySchema.safeParse({ room: "Sala" }).success).toBe(
      false,
    );
    expect(tokenRoomQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("tokenResponseSchema", () => {
  it("exige token e url não-vazios", () => {
    expect(
      tokenResponseSchema.safeParse({ token: "t", url: "ws://x" }).success,
    ).toBe(true);
    expect(tokenResponseSchema.safeParse({ token: "", url: "ws://x" }).success).toBe(
      false,
    );
    expect(tokenResponseSchema.safeParse({ token: 123 }).success).toBe(false);
  });
});


describe("roomPresenceSchema / roomsResponseSchema", () => {
  it("presence estende room com live+count; count negativo falha", () => {
    const p = { ...validRoom, live: true, participantCount: 3 };
    expect(roomPresenceSchema.safeParse(p).success).toBe(true);
    expect(
      roomPresenceSchema.safeParse({ ...p, participantCount: -1 }).success,
    ).toBe(false);
    expect(roomsResponseSchema.safeParse({ rooms: [p] }).success).toBe(true);
    expect(
      roomsResponseSchema.safeParse({ rooms: [{ ...p, live: "yes" }] }).success,
    ).toBe(false);
    expect(roomsResponseSchema.safeParse({}).success).toBe(false);
  });

  it("occupants: default vazio, shape validado, cap respeitado", () => {
    const p = { ...validRoom, live: true, participantCount: 1 };
    const def = roomPresenceSchema.safeParse(p);
    expect(def.success).toBe(true);
    if (def.success) expect(def.data.occupants).toEqual([]);

    const withOcc = {
      ...p,
      occupants: [{ id: "u1", name: "Ada", avatarUrl: null }],
    };
    expect(roomPresenceSchema.safeParse(withOcc).success).toBe(true);
    // id é obrigatório — chave única do each no front
    expect(
      roomPresenceSchema.safeParse({
        ...p,
        occupants: [{ name: "Ada", avatarUrl: null }],
      }).success,
    ).toBe(false);
    expect(
      roomPresenceSchema.safeParse({
        ...p,
        occupants: [{ id: "u1", name: 42, avatarUrl: null }],
      }).success,
    ).toBe(false);
    const overCap = Array.from(
      { length: SHARED_LIMITS.OCCUPANT_PREVIEW_MAX + 1 },
      (_, i) => ({ id: `u${i}`, name: "x", avatarUrl: null }),
    );
    expect(
      roomPresenceSchema.safeParse({ ...p, occupants: overCap }).success,
    ).toBe(false);
    expect(occupantSchema.safeParse({ id: "u1", name: "Ada", avatarUrl: "https://x" }).success).toBe(true);
  });
});

describe("sseEventSchema", () => {
  it("aceita cada tipo e rejeita type desconhecido", () => {
    for (const ev of [
      { type: "session_replaced" },
      { type: "profile_updated", name: "n", avatarUrl: null },
      { type: "rooms_updated", room: "sala-a", live: true, participantCount: 2 },
    ]) {
      expect(sseEventSchema.safeParse(ev).success).toBe(true);
    }
    expect(sseEventSchema.safeParse({ type: "hack" }).success).toBe(false);
    expect(
      sseEventSchema.safeParse({
        type: "rooms_updated",
        room: "sala-a",
        live: true,
        participantCount: -1,
      }).success,
    ).toBe(false);
  });

  it("rooms_updated aceita occupants e aplica default", () => {
    const r = sseEventSchema.safeParse({
      type: "rooms_updated",
      room: "sala-a",
      live: true,
      participantCount: 2,
      occupants: [{ id: "u1", name: "Ada", avatarUrl: "https://cdn/x.png" }],
    });
    expect(r.success).toBe(true);
    const def = sseEventSchema.safeParse({
      type: "rooms_updated",
      room: "sala-a",
      live: false,
      participantCount: 0,
    });
    expect(def.success).toBe(true);
    if (def.success && def.data.type === "rooms_updated") {
      expect(def.data.occupants).toEqual([]);
    }
    expect(
      sseEventSchema.safeParse({
        type: "rooms_updated",
        room: "sala-a",
        live: true,
        participantCount: 1,
        occupants: [{ id: "u1", name: "x".repeat(65), avatarUrl: null }],
      }).success,
    ).toBe(false);
  });
});
