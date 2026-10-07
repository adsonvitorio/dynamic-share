import { beforeEach, describe, expect, it, vi } from "vitest";

const roomMock: { room: null | FakeRoomShape; userName: string } = {
  room: null,
  userName: "Nick",
};
vi.mock("./connection.svelte", () => ({ connectionStore: roomMock }));

const authMock = { user: { avatarUrl: "https://cdn.discordapp.com/a.png" } };
vi.mock("$lib/auth/auth.svelte", () => ({ auth: authMock }));

interface FakeParticipant {
  sid: string;
  identity: string;
  name?: string;
  metadata?: string;
}
interface FakeRoomShape {
  remoteParticipants: Map<string, FakeParticipant>;
  localParticipant: { sid: string };
}

function participant(sid: string, opts: Partial<FakeParticipant> = {}): FakeParticipant {
  return {
    sid,
    identity: `id-${sid}`,
    metadata: JSON.stringify({ avatarUrl: `https://cdn.discordapp.com/${sid}.png` }),
    ...opts,
  };
}

async function loadStore() {
  vi.resetModules();
  const mod = await import("./participants.svelte");
  return mod.participantsStore;
}

beforeEach(() => {
  roomMock.room = null;
  roomMock.userName = "Nick";
});

describe("update", () => {
  it("count = remotos+1, lista local-primeiro com nomes e avatares", async () => {
    const store = await loadStore();
    roomMock.room = {
      remoteParticipants: new Map([
        ["s1", participant("s1", { name: "Ana" })],
        ["s2", participant("s2")],
      ]),
      localParticipant: { sid: "local" },
    };
    store.update();
    expect(store.participantCount).toBe(3);
    expect(store.participants).toHaveLength(3);
    expect(store.participants[0]).toEqual({
      sid: "local",
      name: "Nick",
      isLocal: true,
      avatarUrl: "https://cdn.discordapp.com/a.png",
    });
    expect(store.participants[1]).toMatchObject({
      sid: "s1",
      name: "Ana",
      isLocal: false,
      avatarUrl: "https://cdn.discordapp.com/s1.png",
    });
    expect(store.participants[2]).toMatchObject({ sid: "s2", name: "id-s2" });
  });

  it("nome remoto sanitizado com fallback para identity", async () => {
    const store = await loadStore();
    roomMock.room = {
      remoteParticipants: new Map([["s1", participant("s1", { name: "<>'&" })]]),
      localParticipant: { sid: "local" },
    };
    store.update();
    expect(store.participants[1]?.name).toBe("id-s1");
  });

  it("sem room não altera estado", async () => {
    const store = await loadStore();
    store.participantCount = 7;
    store.update();
    expect(store.participantCount).toBe(7);
  });
});

describe("reset", () => {
  it("zera count e lista", async () => {
    const store = await loadStore();
    roomMock.room = {
      remoteParticipants: new Map([["s1", participant("s1")]]),
      localParticipant: { sid: "local" },
    };
    store.update();
    store.reset();
    expect(store.participantCount).toBe(0);
    expect(store.participants).toEqual([]);
  });
});
