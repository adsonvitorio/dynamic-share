import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { TrackSource } from "livekit-server-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveKitService } from "../src/modules/streaming/livekit.js";

const listRooms = vi.fn();
const createRoom = vi.fn();
const removeParticipant = vi.fn();
const grants: unknown[] = [];
const tokenOptions: unknown[] = [];

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>();
  class MockRoomServiceClient {
    listRooms = listRooms;
    createRoom = createRoom;
    removeParticipant = removeParticipant;
  }
  class MockAccessToken {
    static last: MockAccessToken;
    grant: unknown;
    constructor(
      public key: string,
      public secret: string,
      public opts: unknown,
    ) {
      tokenOptions.push(opts);
      MockAccessToken.last = this;
    }
    addGrant(grant: unknown) {
      this.grant = grant;
      grants.push(grant);
    }
    async toJwt() {
      return "signed.jwt.token";
    }
  }
  return { ...actual, RoomServiceClient: MockRoomServiceClient, AccessToken: MockAccessToken };
});

const KEY = "devkey";
const SECRET = "devsecretdevsecretdevsecretdevsecret";

function service(emptyTimeout = 10) {
  return new LiveKitService("ws://localhost:7880", KEY, SECRET, emptyTimeout);
}

beforeEach(() => {
  listRooms.mockReset();
  createRoom.mockReset();
  removeParticipant.mockReset();
  grants.length = 0;
  tokenOptions.length = 0;
});

describe("LiveKitService.ensureRoom", () => {
  it("retorna o snapshot sem criar quando a sala já existe", async () => {
    listRooms.mockResolvedValue([{ name: "a", numParticipants: 3, numPublishers: 1 }]);
    const svc = service();
    const rooms = await svc.ensureRoom("a");
    expect(createRoom).not.toHaveBeenCalled();
    expect(rooms).toEqual([{ name: "a", numParticipants: 3, numPublishers: 1 }]);
  });

  it("cria a sala com emptyTimeout quando ausente e inclui no snapshot", async () => {
    listRooms.mockResolvedValue([]);
    const svc = service(42);
    const rooms = await svc.ensureRoom("b");
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom).toHaveBeenCalledWith({ name: "b", emptyTimeout: 42 });
    expect(rooms).toEqual([{ name: "b", numParticipants: 0, numPublishers: 0 }]);
  });

  it("duas chamadas concorrentes criam uma única sala (single-flight)", async () => {
    listRooms.mockResolvedValue([]);
    const svc = service();
    await Promise.all([svc.ensureRoom("x"), svc.ensureRoom("x")]);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(listRooms).toHaveBeenCalledTimes(1);
  });

  it("falha no ensureRoom libera o lock e a próxima chamada tenta de novo", async () => {
    listRooms.mockRejectedValueOnce(new Error("livekit down")).mockResolvedValue([]);
    const svc = service();
    await expect(svc.ensureRoom("x")).rejects.toThrow("livekit down");
    const rooms = await svc.ensureRoom("x");
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(rooms).toEqual([{ name: "x", numParticipants: 0, numPublishers: 0 }]);
  });
});

describe("LiveKitService.generateToken", () => {
  it("emite JWT com grants, identity, metadata e ttl repassados", async () => {
    const svc = service();
    const jwt = await svc.generateToken({
      room: "a",
      identity: "user-abc123",
      name: "Fulano",
      metadata: JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/x.png" }),
      ttlSec: 3600,
    });
    expect(jwt).toBe("signed.jwt.token");
    expect(tokenOptions[0]).toMatchObject({
      identity: "user-abc123",
      name: "Fulano",
      ttl: 3600,
      metadata: JSON.stringify({ avatarUrl: "https://cdn.discordapp.com/x.png" }),
    });
    expect(grants[0]).toEqual({
      room: "a",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // App é screen-share-only — camera/mic não podem ser publicadas.
      canPublishSources: [
        TrackSource.SCREEN_SHARE,
        TrackSource.SCREEN_SHARE_AUDIO,
      ],
    });
  });
});

describe("LiveKitService.kickParticipant", () => {
  it("remove a identity de todas as salas (revogação de sessão)", async () => {
    listRooms.mockResolvedValue([{ name: "a" }, { name: "b" }]);
    const svc = service();
    await svc.kickParticipant("user-abc");
    expect(removeParticipant).toHaveBeenCalledWith("a", "user-abc");
    expect(removeParticipant).toHaveBeenCalledWith("b", "user-abc");
  });

  it("não propaga falha — kick é best-effort sobre JWT stateless", async () => {
    listRooms.mockRejectedValue(new Error("livekit down"));
    const svc = service();
    await expect(svc.kickParticipant("user-abc")).resolves.toBeUndefined();
  });
});

describe("LiveKitService.verifyWebhook", () => {
  it("rejeita URL que não começa com ws:// ou wss://", () => {
    expect(() => new LiveKitService("http://x", KEY, SECRET, 10)).toThrow("ws://");
  });

  it("aceita webhook com assinatura JWT válida (claim sha256 do body)", async () => {
    const svc = service();
    const body = JSON.stringify({ event: "room_started", room: { name: "a" } });
    const sha256 = createHash("sha256").update(body).digest("base64");
    const jwt = await new SignJWT({ sha256 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(KEY)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    const event = await svc.verifyWebhook(Buffer.from(body), jwt);
    expect(event.event).toBe("room_started");
    expect(event.room?.name).toBe("a");
  });

  it("rejeita assinatura forjada ou body adulterado", async () => {
    const svc = service();
    const body = JSON.stringify({ event: "room_started" });
    const jwt = await new SignJWT({ sha256: "hash-errado" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(KEY)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(svc.verifyWebhook(Buffer.from(body), jwt)).rejects.toThrow();
    await expect(svc.verifyWebhook(Buffer.from(body), "lixo")).rejects.toThrow();
  });
});
