import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ParticipantInfo, WebhookEvent } from "livekit-server-sdk";
import { SHARED_LIMITS, type SseEvent } from "@share/shared";
import { PresenceService } from "../src/modules/streaming/presence.js";
import { PRESENCE } from "../src/core/config/constants.js";
import { SessionEvents } from "../src/modules/auth/session-events.js";

function makeEvents() {
  const events = new SessionEvents();
  const sent: SseEvent[] = [];
  vi.spyOn(events, "broadcast").mockImplementation((event) => {
    sent.push(event);
  });
  return { events, sent };
}

function evt(
  event: string,
  roomName?: string,
  numParticipants?: number,
  identity?: string,
  participantName?: string,
  metadata?: string,
  trackSource?: number,
  numPublishers?: number,
  sid?: string,
): WebhookEvent {
  return {
    event,
    room: roomName ? { name: roomName, numParticipants, numPublishers } : undefined,
    participant: identity ? { sid, identity, name: participantName, metadata } : undefined,
    track: trackSource !== undefined ? { source: trackSource } : undefined,
  } as unknown as WebhookEvent;
}

const SCREEN = 3;
const CAMERA = 1;
const SCREEN_AUDIO = 4;

// Lister default dos testes: o debounce (500ms unref) nunca dispara dentro
// de um teste síncrono — quem exercita o scheduler injeta o próprio fake.
const listStub = async () => [] as ParticipantInfo[];

const AVATAR = "https://cdn.discordapp.com/avatars/1/x.png";

// id do occupant = sha256(identity).16 — o front usa como chave única.
const oid = (identity: string) =>
  crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16);

describe("PresenceService.handleEvent", () => {
  it("participant_joined usa numParticipants absoluto do evento", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 3, "user-x"));
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 3, occupants: [] },
    ]);
    expect(p.snapshot().get("sala")).toEqual({ live: false, participantCount: 3, occupants: [] });
  });

  it("fallback +-1 quando numParticipants está ausente", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala"));
    p.handleEvent(evt("participant_joined", "sala"));
    p.handleEvent(evt("participant_left", "sala"));
    expect(p.snapshot().get("sala")).toEqual({ live: false, participantCount: 1, occupants: [] });
  });

  it("room_finished zera e notifica se estava live", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("room_finished", "sala"));
    expect(p.snapshot().get("sala")).toBeUndefined();
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 0, occupants: [] },
    ]);
  });

  it("room_finished de sala ocupada sem transmissão também notifica", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2));
    sent.length = 0;
    p.handleEvent(evt("room_finished", "sala"));
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 0, occupants: [] },
    ]);
  });

  it("room_started sem count registra 0 sem broadcast de live", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("room_started", "sala"));
    expect(p.snapshot().get("sala")?.live ?? false).toBe(false);
    expect(sent).toEqual([]);
  });

  it("evento de sala com nome fora do regex é ignorado", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "Nome_Com_Espaco", 5, "user-x"));
    p.handleEvent(evt("participant_joined", "nome invalido com espaco", 5));
    expect(sent).toEqual([]);
    expect(p.snapshot().size).toBe(0);
  });

  it("não dispara broadcast quando o evento repete o mesmo count", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2));
    sent.length = 0;
    p.handleEvent(evt("participant_left", "sala", 2));
    expect(sent).toEqual([]);
  });

});

describe("PresenceService.reconcile", () => {
  it("aplica counts do snapshot e zera salas ausentes", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "velha", 2));
    sent.length = 0;
    p.reconcile([
      { name: "nova", numParticipants: 5, numPublishers: 1 },
      { name: "parada", numParticipants: 3, numPublishers: 0 },
      { name: "Nome Invalido", numParticipants: 9, numPublishers: 2 },
    ]);
    expect(p.snapshot().get("nova")).toEqual({ live: true, participantCount: 5, occupants: [] });
    expect(p.snapshot().get("parada")).toEqual({ live: false, participantCount: 3, occupants: [] });
    expect(p.snapshot().get("velha")).toBeUndefined();
    expect(p.snapshot().get("Nome Invalido")).toBeUndefined();
    expect(sent).toEqual([
      { type: "rooms_updated", room: "nova", live: true, participantCount: 5, occupants: [] },
      { type: "rooms_updated", room: "parada", live: false, participantCount: 3, occupants: [] },
      { type: "rooms_updated", room: "velha", live: false, participantCount: 0, occupants: [] },
    ]);
  });

  it("reconcile corrige live stale sem mudança de count", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 0 }]);
    expect(p.snapshot().get("sala")?.live).toBe(false);
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 2, occupants: [] },
    ]);
  });
});

describe("PresenceService live via track events", () => {
  it("track_published SCREEN_SHARE liga live e broadcasta", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    sent.length = 0;
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(p.snapshot().get("sala")?.live).toBe(true);
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: true, participantCount: 1, occupants: [] },
    ]);
  });

  it("track_unpublished desliga live e broadcasta", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(p.snapshot().get("sala")?.live).toBe(false);
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 1, occupants: [] },
    ]);
  });

  it("ignora tracks que não são screen share (camera/audio)", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    sent.length = 0;
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, CAMERA));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN_AUDIO));
    expect(sent).toEqual([]);
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("segundo sharer mantém live após unpublish do primeiro", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    p.handleEvent(evt("track_published", "sala", undefined, "user-b", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    // live não muda mas a flag sharing dos occupants sim — broadcasta.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ live: true });
    expect(p.snapshot().get("sala")?.live).toBe(true);
  });

  it("re-publish do mesmo sharer não re-broadcasta", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(sent).toEqual([]);
  });

  it("participant_left do sharer desliga live", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("participant_left", "sala", 1, "user-a"));
    expect(p.snapshot().get("sala")?.live).toBe(false);
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 1, occupants: [] },
    ]);
  });

  it("unpublish limpa liveHint seedado pelo reconcile", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 1 }]);
    sent.length = 0;
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(p.snapshot().get("sala")?.live).toBe(false);
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 2, occupants: [] },
    ]);
  });

  it("track event em sala desconhecida é ignorado", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("track_published", "fantasma", undefined, "user-a", undefined, undefined, SCREEN));
    expect(sent).toEqual([]);
    expect(p.snapshot().size).toBe(0);
  });

  it("track event sem identity é ignorado", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    sent.length = 0;
    p.handleEvent(evt("track_published", "sala", undefined, undefined, undefined, undefined, SCREEN));
    expect(sent).toEqual([]);
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });
});

describe("PresenceService occupants", () => {
  const META = JSON.stringify({ avatarUrl: AVATAR });

  it("join com name+metadata registra occupant no snapshot e no broadcast", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR },
    ]);
    expect(sent[0]).toMatchObject({
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("left remove o occupant correspondente", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    p.handleEvent(evt("participant_left", "sala", 1, "user-a"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
    ]);
  });

  it("metadata malformada ou avatar fora do CDN vira avatarUrl null", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", "{bad"));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", JSON.stringify({ avatarUrl: "https://evil.example.com/x.png" })));
    p.handleEvent(evt("participant_joined", "sala", 3, "user-c", "Cid"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: null },
      { id: oid("user-b"), name: "Beto", avatarUrl: null },
      { id: oid("user-c"), name: "Cid", avatarUrl: null },
    ]);
  });

  it("participante sem name nao vira occupant", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([]);
  });

  it("respeita o cap OCCUPANT_PREVIEW_MAX", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    for (let i = 0; i < SHARED_LIMITS.OCCUPANT_PREVIEW_MAX + 3; i++) {
      p.handleEvent(evt("participant_joined", "sala", i + 1, `user-${i}`, `P${i}`, META));
    }
    const occ = p.snapshot().get("sala")?.occupants ?? [];
    expect(occ).toHaveLength(SHARED_LIMITS.OCCUPANT_PREVIEW_MAX);
    expect(occ.map((o) => o.name)).not.toContain(`P${SHARED_LIMITS.OCCUPANT_PREVIEW_MAX + 2}`);
  });

  it("count zero limpa occupants residuais", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    p.handleEvent(evt("participant_left", "sala", 0, "user-x"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([]);
  });

  it("room_finished descarta occupants", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    p.handleEvent(evt("room_finished", "sala"));
    expect(p.snapshot().size).toBe(0);
  });

  it("track_published marca o occupant sharer com sharing:true", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    sent.length = 0;
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(sent[0]).toMatchObject({
      live: true,
      occupants: [
        { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR, sharing: true },
        { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
      ],
    });
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR, sharing: true },
      { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
    ]);
  });

  it("track_unpublished desmarca sharing do occupant", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    expect(sent[0]).toMatchObject({
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR },
    ]);
  });

  it("join/leave com share ativo mantém flag sharing no broadcast", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    sent.length = 0;
    // join/leave passam por set() — a flag não pode flapar no broadcast.
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    expect(sent[0]).toMatchObject({
      occupants: [
        { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR, sharing: true },
        { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
      ],
    });
  });

  it("rejoin da mesma identity atualiza name/avatar", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana2", JSON.stringify({ avatarUrl: null })));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana2", avatarUrl: null },
    ]);
  });

  it("room_started tardio (após join) não apaga occupants nem count", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    // LiveKit pode entregar room_started depois do primeiro join, com o
    // count do momento da criação (0) — não pode clobberar o estado real.
    p.handleEvent(evt("room_started", "sala", 0));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("room_started primeiro ainda semeia a entry para joins seguintes", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("room_started", "sala", 0));
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("participant_joined com numParticipants=0 (criador) não apaga o occupant", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("room_started", "sala", 0));
    // Join do criador pode carregar o count do snapshot pré-registro (0) —
    // o joiner existe por definição, então o floor é 1.
    p.handleEvent(evt("participant_joined", "sala", 0, "user-a", "Ana", META));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("participant_left com numPublishers=0 limpa liveHint stale", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    // Restart do server com share ativo: reconcile semeia só o hint.
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 1 }]);
    // O publisher sai sem track_unpublished — numPublishers do evento é autoridade.
    p.handleEvent(evt("participant_left", "sala", 1, "user-x", undefined, undefined, undefined, 0));
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("participant_left com numPublishers=0 limpa sharer que não recebeu unpublish", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN));
    // Outra pessoa sai, mas o evento reporta zero publishers — autoridade.
    p.handleEvent(evt("participant_left", "sala", 1, "user-b", undefined, undefined, undefined, 0));
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("join/left sem numPublishers preserva liveHint", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 1 }]);
    p.handleEvent(evt("participant_joined", "sala", 3, "user-x"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
    p.handleEvent(evt("participant_left", "sala", 2, "user-x"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
  });

  it("mudanca so de occupant (count igual) dispara broadcast", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
    sent.length = 0;
    p.handleEvent(evt("participant_left", "sala", 1, "user-a"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ participantCount: 1, occupants: [] });
  });

  it("left sem identity correspondente descarta o occupant mais antigo (stale)", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    // Ana entrou, mas seu left nunca chegou — occupant fica stale no map.
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    // Left de identity desconhecida com count absoluto 1 — o mais antigo
    // (Ana) é o stale e sai; Beto (real) fica.
    p.handleEvent(evt("participant_left", "sala", 1, "user-z"));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-b"), name: "Beto", avatarUrl: AVATAR }],
    });
  });

  it("trim de stale não roda em join com count defasado", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    // Join do Cid com count atrasado (=2, mas já são 3) — não pode cortar
    // occupant real; o próximo evento absoluto ressincroniza o número.
    p.handleEvent(evt("participant_joined", "sala", 2, "user-c", "Cid", META));
    expect(p.snapshot().get("sala")?.occupants).toHaveLength(3);
  });

  it("left atrasado de sid velho não apaga occupant da sessão nova (rejoin)", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    // Rejoin: mesma identity, sid novo — LiveKit entrega join antes do
    // leave da sessão velha quando o disconnect é detectado por timeout.
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("left do sid registrado remove normalmente", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META, undefined, undefined, "sid-B1"));
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
    ]);
  });

  it("left stale com numParticipants=0 não zera occupants da sessão nova", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    // Leave velho reporta a sala vazia do momento em que saiu — count=0
    // stale não pode acionar o clear sobre a sessão nova.
    p.handleEvent(evt("participant_left", "sala", 0, "user-a", undefined, undefined, undefined, 0, "sid-A1"));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-a"), name: "Ana", avatarUrl: AVATAR }],
    });
  });

  it("left stale com numPublishers=0 não derruba live da sessão nova", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    // Leave velho com numPublishers=0 do snapshot pré-rejoin — não pode
    // apagar o sharer nem o hint da sessão nova.
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, 0, "sid-A1"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
  });

  it("track_unpublished de sid velho não apaga sharer da sessão nova", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    // Unpublish da sessão morta (sid-A1) chega depois do publish novo.
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
  });

  it("track_unpublished do sid registrado desliga live normalmente", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A1"));
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("left stale com count não-zero não dispara trim nem regride count", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META, undefined, undefined, "sid-B1"));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    // Leave velho reporta count=1 do momento da saída — não pode regredir
    // o count real (2) nem disparar o trim que despejaria a Ana rejoin.
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 2,
      occupants: [
        { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR },
        { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
      ],
    });
  });

  it("evento stale não dispara broadcast", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    sent.length = 0;
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, 0, "sid-A1"));
    expect(sent).toEqual([]);
  });

  it("publish atrasado de sid velho não sobrescreve o sid do sharer novo", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    // Publish da sessão morta chega atrasado — ignorado.
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A1"));
    // Unpublish real da sessão nova aplica normalmente.
    p.handleEvent(evt("track_unpublished", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("publish com sid divergente do registrado é rejeitado (ordem extrema se cura no join)", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    // track_published de sid divergente do sids registrado é tratado como
    // sessão morta — sem ele, um publish atrasado sobrescrevia o sid do
    // sharer e o unpublish real virava "stale" (AO VIVO preso). Se for
    // reordenação publish-antes-do-join (rara: join precede publish), o
    // join ancora o sid e o próximo publish/syncRoom cura.
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    expect(p.snapshot().get("sala")?.live).toBe(false);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("track_published", "sala", undefined, "user-a", undefined, undefined, SCREEN, undefined, "sid-A2"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
    // E o leave do sid velho não derruba nem occupant nem share.
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.live).toBe(true);
    expect(p.snapshot().get("sala")?.occupants).toHaveLength(1);
  });

  it("rejoin sem name ainda registra sid — left velho não apaga", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, undefined, "sid-A1"));
    // Rejoin com name ausente (metadata quebrada): occupant não atualiza,
    // mas o sid novo precisa ancorar para o leave velho não clobberar.
    p.handleEvent(evt("participant_joined", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A2"));
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR },
    ]);
  });

  it("syncRoom registra sids — evento velho pós-restart não apaga occupant real", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.syncRoom("sala", [
      { identity: "user-a", sid: "sid-A9", name: "Ana", metadata: META, tracks: [] } as unknown as ParticipantInfo,
    ]);
    // Leave de uma sessão que morreu antes do restart (sid antigo).
    p.handleEvent(evt("participant_left", "sala", 1, "user-a", undefined, undefined, undefined, undefined, "sid-A1"));
    expect(p.snapshot().get("sala")?.occupants).toEqual([
      { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR },
    ]);
  });
});

describe("PresenceService.syncRoom (reconcile autoritativo)", () => {
  const META = JSON.stringify({ avatarUrl: AVATAR });
  const pinfo = (
    identity: string,
    name: string,
    metadata?: string,
    sources: number[] = [],
  ): ParticipantInfo =>
    ({
      identity,
      name,
      metadata,
      tracks: sources.map((source) => ({ source })),
    }) as unknown as ParticipantInfo;

  it("reconstrói occupants e sharers do estado real da sala", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.syncRoom("sala", [
      pinfo("user-a", "Ana", META, [SCREEN]),
      pinfo("user-b", "Beto", META),
    ]);
    expect(p.snapshot().get("sala")).toEqual({
      live: true,
      participantCount: 2,
      occupants: [
        { id: oid("user-a"), name: "Ana", avatarUrl: AVATAR, sharing: true },
        { id: oid("user-b"), name: "Beto", avatarUrl: AVATAR },
      ],
    });
    expect(sent).toHaveLength(1);
  });

  it("remove occupant stale cujo leave foi perdido", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META));
    // Ana saiu sem webhook — o sync a remove.
    p.syncRoom("sala", [pinfo("user-b", "Beto", META)]);
    expect(p.snapshot().get("sala")).toEqual({
      live: false,
      participantCount: 1,
      occupants: [{ id: oid("user-b"), name: "Beto", avatarUrl: AVATAR }],
    });
  });

  it("pós-restart: repopula occupants/sharers que o reconcile por counts não tinha", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 1 }]);
    expect(p.snapshot().get("sala")?.occupants).toEqual([]);
    sent.length = 0;
    p.syncRoom("sala", [
      pinfo("user-a", "Ana", META, [SCREEN]),
      pinfo("user-b", "Beto", META),
    ]);
    const snap = p.snapshot().get("sala");
    expect(snap?.live).toBe(true);
    expect(snap?.occupants).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  it("limpa live stale quando ninguém mais publica tela", () => {
    const { events } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.reconcile([{ name: "sala", numParticipants: 2, numPublishers: 1 }]);
    p.syncRoom("sala", [pinfo("user-a", "Ana", META), pinfo("user-b", "Beto", META)]);
    expect(p.snapshot().get("sala")?.live).toBe(false);
  });

  it("sala vazia remove a entry e broadcasta zerada", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.handleEvent(evt("participant_joined", "sala", 2, "user-a", "Ana", META));
    sent.length = 0;
    p.syncRoom("sala", []);
    expect(p.snapshot().get("sala")).toBeUndefined();
    expect(sent).toEqual([
      { type: "rooms_updated", room: "sala", live: false, participantCount: 0, occupants: [] },
    ]);
  });

  it("estado idêntico não re-broadcasta (chamadas periódicas são baratas)", () => {
    const { events, sent } = makeEvents();
    const p = new PresenceService(events, listStub);
    p.syncRoom("sala", [pinfo("user-a", "Ana", META, [SCREEN])]);
    sent.length = 0;
    p.syncRoom("sala", [pinfo("user-a", "Ana", META, [SCREEN])]);
    expect(sent).toEqual([]);
  });
});

describe("PresenceService sync disparado por evento (webhook = gatilho)", () => {
  const META = JSON.stringify({ avatarUrl: AVATAR });
  const pinfo = (
    identity: string,
    name: string,
    sid: string,
    metadata?: string,
    sources: number[] = [],
  ): ParticipantInfo =>
    ({
      identity,
      sid,
      name,
      metadata,
      tracks: sources.map((source) => ({ source })),
    }) as unknown as ParticipantInfo;

  async function flush() {
    await vi.advanceTimersByTimeAsync(PRESENCE.SYNC_DEBOUNCE_MS + 50);
  }

  it("rajada de eventos coalesce num único listParticipants por sala", async () => {
    vi.useFakeTimers();
    try {
      const { events } = makeEvents();
      const calls: string[] = [];
      const p = new PresenceService(events, async (room) => {
        calls.push(room);
        return [];
      });
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana"));
      p.handleEvent(evt("participant_left", "sala", 0, "user-a", "Ana"));
      p.handleEvent(evt("participant_joined", "outra", 1, "user-b", "Beto"));
      await flush();
      expect(calls).toEqual(["sala", "outra"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("join retransmitido depois do leave é apagado pelo sync autoritativo", async () => {
    vi.useFakeTimers();
    try {
      const { events, sent } = makeEvents();
      const p = new PresenceService(events, async () => []);
      // entra, sai — e o join da sessão morta chega retransmitido DEPOIS
      // do leave (retry do LiveKit): ressuscita o fantasma no estado
      // derivado de eventos.
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, 0, "sid-1"));
      p.handleEvent(evt("participant_left", "sala", 0, "user-a", "Ana", META, undefined, 0, "sid-1"));
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, 1, "sid-1"));
      expect(p.snapshot().get("sala")?.occupants).toHaveLength(1);
      // O sync do LiveKit (sala realmente vazia) apaga o fantasma.
      await flush();
      expect(p.snapshot().get("sala")).toBeUndefined();
      expect(sent.at(-1)).toMatchObject({ participantCount: 0, occupants: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sharer/live órfão de webhook perdido é corrigido pelo sync", async () => {
    vi.useFakeTimers();
    try {
      const { events } = makeEvents();
      const p = new PresenceService(events, async () => [pinfo("user-b", "Beto", "sid-b", META)]);
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, 0, "sid-a"));
      p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META, undefined, 0, "sid-b"));
      p.handleEvent(evt("track_published", "sala", 2, "user-a", "Ana", META, SCREEN, 1, "sid-a"));
      expect(p.snapshot().get("sala")?.live).toBe(true);
      // track_unpublished + participant_left de Ana se perderam — o sync
      // da rajada seguinte (ou desta) reflete a verdade: só Beto, sem tela.
      await flush();
      const snap = p.snapshot().get("sala");
      expect(snap).toEqual({
        live: false,
        participantCount: 1,
        occupants: [{ id: oid("user-b"), name: "Beto", avatarUrl: AVATAR }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("evento durante flush lento (> debounce) não fica stranded", async () => {
    vi.useFakeTimers();
    try {
      const { events } = makeEvents();
      let resolveList: (v: ParticipantInfo[]) => void = () => {};
      const calls: string[] = [];
      const p = new PresenceService(events, async (room) => {
        calls.push(room);
        if (calls.length === 1) {
          return new Promise<ParticipantInfo[]>((res) => {
            resolveList = res;
          });
        }
        return [];
      });
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, 1, "sid-a"));
      await flush(); // flush1 inicia e trava no listParticipants pendente
      expect(calls).toEqual(["sala"]);
      // Evento durante o flush1: marca dirty e arma timer2.
      p.handleEvent(evt("participant_joined", "sala", 2, "user-b", "Beto", META, undefined, 2, "sid-b"));
      // timer2 dispara com flush1 ainda rodando → early-return sem re-arm.
      await flush();
      resolveList([]);
      await Promise.resolve();
      // O finally do flush1 rearma — a onda stranded sai.
      await flush();
      expect(calls).toEqual(["sala", "sala"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evento chegando durante o flush agenda nova onda", async () => {
    vi.useFakeTimers();
    try {
      const { events } = makeEvents();
      let calls = 0;
      const p = new PresenceService(events, async (room) => {
        calls++;
        // Durante o await do sync, outro evento marca a sala de novo.
        if (calls === 1) {
          p.handleEvent(evt("participant_joined", "sala", 2, "user-c", "Cris", META, undefined, 2, "sid-c"));
        }
        return [];
      });
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META, undefined, 1, "sid-a"));
      await flush();
      await flush();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("syncAll agenda sync das salas conhecidas", async () => {
    vi.useFakeTimers();
    try {
      const { events } = makeEvents();
      const calls: string[] = [];
      const p = new PresenceService(events, async (room) => {
        calls.push(room);
        // Entry precisa sobreviver ao sync — sala realmente vazia é
        // deletada e sai do mapa que o syncAll itera.
        return [pinfo("user-x", "Xuxa", `sid-${room}`, META)];
      });
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana"));
      p.handleEvent(evt("participant_joined", "cais", 1, "user-b", "Beto"));
      await flush();
      calls.length = 0;
      p.syncAll();
      await flush();
      expect(calls.sort()).toEqual(["cais", "sala"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falha do listParticipants não derruba — loga e segue", async () => {
    vi.useFakeTimers();
    try {
      const { events, sent } = makeEvents();
      const p = new PresenceService(events, async () => {
        throw new Error("livekit down");
      });
      p.handleEvent(evt("participant_joined", "sala", 1, "user-a", "Ana", META));
      sent.length = 0;
      await flush();
      // Estado derivado do evento permanece — o próximo gatilho retenta.
      expect(p.snapshot().get("sala")?.occupants).toHaveLength(1);
      expect(sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

