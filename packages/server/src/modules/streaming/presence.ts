import crypto from "node:crypto";
import { SHARED_LIMITS, type Occupant } from "@share/shared";
import { TrackSource, type ParticipantInfo, type WebhookEvent } from "livekit-server-sdk";
import { DISCORD, PRESENCE } from "../../core/config/constants.js";
import { createLogger } from "../../core/logging/logger.js";
import { maskedId } from "../../core/logging/pii.js";
import type { SessionEvents } from "../auth/session-events.js";
import type { RoomSummary } from "./livekit.js";
import { isValidRoomName } from "./names.js";

const log = createLogger("Presence");

export interface PresenceInfo {
  live: boolean;
  participantCount: number;
  occupants: Occupant[];
}

interface Entry {
  slug: string;
  participantCount: number;
  occupants: Map<string, Occupant>;
  // sid da sessão mais recente por identity — quem sai e re-entra rápido
  // gera participant_left/track_unpublished atrasados do sid velho, que
  // não podem apagar o estado da sessão nova (mesma identity).
  sids: Map<string, string>;
  sharers: Map<string, string>;
  // liveHint vem do numPublishers do reconcile — cobre boot com share já
  // ativo, quando nenhum track_published novo chega para semear sharers.
  liveHint: boolean;
}

function isLive(entry: Entry): boolean {
  return entry.sharers.size > 0 || entry.liveHint;
}

// Occupants saem com `sharing` marcado — o hub destaca quem transmite.
function markedOccupants(entry: Entry): Occupant[] {
  if (entry.sharers.size === 0) return [...entry.occupants.values()];
  return [...entry.occupants.entries()].map(([identity, occupant]) =>
    entry.sharers.has(identity) ? { ...occupant, sharing: true } : occupant,
  );
}

type OccupantDelta =
  | { kind: "add"; participant: WebhookEvent["participant"] }
  | { kind: "remove"; identity: string | undefined; sid: string | undefined };

type ParticipantLike = { sid?: string; identity?: string; name?: string; metadata?: string } | undefined;

function toOccupant(participant: ParticipantLike): { identity: string; occupant: Occupant } | null {
  const identity = participant?.identity;
  const name = participant?.name;
  if (!identity || !name) {
    if (identity) {
      log.debug("occupant_dropped_no_name", { identity: maskedId(identity) });
    }
    return null;
  }
  let avatarUrl: string | null = null;
  if (participant.metadata) {
    try {
      const data: unknown = JSON.parse(participant.metadata);
      const url = (data as Record<string, unknown>).avatarUrl;
      if (typeof url === "string" && url.startsWith(`${DISCORD.CDN_BASE}/`)) avatarUrl = url;
    } catch {
      log.debug("participant_metadata_invalid", { identity: maskedId(identity) });
    }
  }
  return {
    identity,
    // id é um hash da identity — chave única/estável para o front (keyed
    // each, dedup) sem expor a identity LiveKit a quem só vê o hub.
    occupant: {
      id: crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16),
      name: name.slice(0, SHARED_LIMITS.DISPLAY_NAME_MAX_LENGTH),
      avatarUrl,
    },
  };
}

/**
 * Presença de salas alimentada por webhooks assinados do LiveKit.
 * Counts vêm do estado absoluto do evento (numParticipants) — nunca de
 * incrementos cegos. O evento é só gatilho: todo evento de sala (e cada
 * subscribe SSE) agenda um syncRoom debounced via listParticipants, que
 * reconstrói occupants/sharers/sids do snapshot real — entrega perdida
 * ou reordenada de webhook não deixa estado stale. Sem polling.
 */
export class PresenceService {
  private entries = new Map<string, Entry>();
  private syncDirty = new Set<string>();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncRunning = false;

  constructor(
    private events: SessionEvents,
    private listParticipants: (roomName: string) => Promise<ParticipantInfo[]>,
  ) {}

  handleEvent(event: WebhookEvent): void {
    const roomName = event.room?.name;
    const valid = roomName !== undefined && isValidRoomName(roomName);
    const identity = event.participant?.identity;

    switch (event.event) {
      case "room_started":
        log.info("room_started", { room: roomName });
        // Só semeia a entry quando ausente: room_started pode chegar após
        // participant_joined (ordem não garantida) reportando o count do
        // momento da criação — reescrever com 0 apagaria o ocupante.
        if (valid && !this.entries.has(roomName)) {
          this.set(roomName, event.room?.numParticipants ?? 0);
        }
        break;
      case "participant_joined":
      case "participant_left": {
        log.info(event.event, { room: roomName, identity: maskedId(identity) });
        if (!valid) break;
        const current = this.entries.get(roomName)?.participantCount ?? 0;
        const absolute = event.room?.numParticipants;
        // Join com absolute=0 é contraditório (o joiner existe por definição)
        // — o count pode vir do snapshot pré-registro do criador da sala.
        // Sem o clamp o occupant recém-adicionado seria apagado pelo clear
        // de count=0 e a 1ª pessoa nunca apareceria no hub.
        const next =
          event.event === "participant_joined"
            ? Math.max(1, absolute ?? current + 1)
            : (absolute ?? Math.max(0, current - 1));
        const delta: OccupantDelta =
          event.event === "participant_joined"
            ? { kind: "add", participant: event.participant }
            : { kind: "remove", identity, sid: event.participant?.sid };
        // numPublishers do evento é autoridade: publisher que desconecta sem
        // track_unpublished deixa liveHint stale — sem isso o badge ficava
        // ligado até a sala esvaziar.
        const publishers = event.room?.numPublishers;
        this.set(
          roomName,
          next,
          delta,
          publishers === undefined ? undefined : publishers > 0,
        );
        break;
      }
      case "track_published":
      case "track_unpublished": {
        if (!valid || !identity || event.track?.source !== TrackSource.SCREEN_SHARE) break;
        log.info(event.event, { room: roomName, identity: maskedId(identity) });
        this.setSharing(
          roomName,
          identity,
          event.event === "track_published",
          event.participant?.sid,
        );
        break;
      }
      case "room_finished":
        log.info("room_finished", { room: roomName });
        if (valid) this.remove(roomName);
        break;
      default:
        break;
    }

    // Todo evento de sala agenda um sync autoritativo: o evento atualiza
    // na hora (UX instantânea) e o snapshot do LiveKit corrige qualquer
    // drift — join retransmitido depois do leave, leave perdido, publish
    // órfão — sem depender da ordem/integridade da entrega de webhooks.
    if (valid) this.scheduleSync(roomName);
  }

  /**
   * Agenda syncRoom autoritativo para as salas conhecidas —
   * gatilho do subscribe SSE: cada connect/reconnect do hub sana entries
   * cujos webhooks se perderam (restart do server, falha de entrega).
   */
  syncAll(): void {
    for (const key of this.entries.keys()) {
      this.scheduleSync(key);
    }
  }

  /** Debounce por rajada: eventos coalescem num único flush de syncs. */
  private scheduleSync(roomName: string): void {
    this.syncDirty.add(roomName);
    this.armSyncTimer();
  }

  private armSyncTimer(): void {
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.flushSync();
    }, PRESENCE.SYNC_DEBOUNCE_MS);
    this.syncTimer.unref?.();
  }

  private async flushSync(): Promise<void> {
    if (this.syncRunning || this.syncDirty.size === 0) return;
    this.syncRunning = true;
    try {
      const rooms = [...this.syncDirty];
      this.syncDirty.clear();
      await Promise.all(
        rooms.map(async (roomName) => {
          if (!isValidRoomName(roomName)) return;
          try {
            this.syncRoom(roomName, await this.listParticipants(roomName));
          } catch (err) {
            log.warn("presence_sync_failed", { room: roomName, err: String(err) });
          }
        }),
      );
    } finally {
      this.syncRunning = false;
      // Flush lento (> debounce) + evento durante o await: o timer do
      // evento disparou e saiu no early-return de syncRunning — sem este
      // re-arm o dirty ficaria stranded até o próximo gatilho externo.
      if (this.syncDirty.size > 0) this.armSyncTimer();
    }
  }

  reconcile(rooms: RoomSummary[]): void {
    const seen = new Set<string>();
    for (const room of rooms) {
      if (!isValidRoomName(room.name)) continue;
      seen.add(room.name);
      this.set(room.name, room.numParticipants, undefined, room.numPublishers > 0);
    }
    for (const [key, entry] of [...this.entries]) {
      if (!seen.has(key)) this.remove(entry.slug);
    }
  }

  /**
   * Reconciliação autoritativa com listParticipants — cobre webhooks
   * perdidos (leave que nunca chegou) e restart do server: occupants e
   * sharers são reconstruídos do estado real, não de eventos. Broadcast
   * só quando o estado visível muda.
   */
  syncRoom(slug: string, participants: ParticipantInfo[]): void {
    const prev = this.entries.get(slug);
    if (participants.length === 0) {
      if (prev) {
        this.entries.delete(slug);
        if (prev.participantCount > 0 || isLive(prev)) {
          this.broadcast(slug, 0, [], false);
        }
      }
      return;
    }
    const occupants = new Map<string, Occupant>();
    const sids = new Map<string, string>();
    const sharers = new Map<string, string>();
    for (const participant of participants) {
      if (occupants.size < SHARED_LIMITS.OCCUPANT_PREVIEW_MAX) {
        const parsed = toOccupant(participant);
        if (parsed) occupants.set(parsed.identity, parsed.occupant);
      }
      sids.set(participant.identity, participant.sid);
      if (participant.tracks.some((track) => track.source === TrackSource.SCREEN_SHARE)) {
        sharers.set(participant.identity, participant.sid);
      }
    }
    const entry: Entry = {
      slug,
      participantCount: participants.length,
      occupants,
      sids,
      sharers,
      liveHint: sharers.size > 0,
    };
    const live = isLive(entry);
    const changed =
      !prev ||
      prev.participantCount !== entry.participantCount ||
      isLive(prev) !== live ||
      prev.sharers.size !== sharers.size ||
      [...sharers.keys()].some((identity) => !prev.sharers.has(identity)) ||
      prev.occupants.size !== occupants.size ||
      [...occupants.entries()].some(([identity, occupant]) => {
        const p = prev.occupants.get(identity);
        return !p || p.name !== occupant.name || p.avatarUrl !== occupant.avatarUrl;
      });
    this.entries.set(slug, entry);
    if (changed) {
      this.broadcast(slug, entry.participantCount, markedOccupants(entry), live);
    }
  }

  snapshot(): Map<string, PresenceInfo> {
    const out = new Map<string, PresenceInfo>();
    for (const entry of this.entries.values()) {
      out.set(entry.slug, {
        live: isLive(entry),
        participantCount: entry.participantCount,
        occupants: markedOccupants(entry),
      });
    }
    return out;
  }

  private set(
    slug: string,
    participantCount: number,
    delta?: OccupantDelta,
    liveHint?: boolean,
  ): void {
    const prev = this.entries.get(slug);
    const occupants = new Map(prev?.occupants ?? []);
    const sids = new Map(prev?.sids ?? []);
    const sharers = new Map(prev?.sharers ?? []);
    let changed = false;
    // sid bookkeeping persiste mesmo quando nada visível muda — rejoin com
    // mesmo nome/avatar não dispara broadcast mas precisa registrar o sid
    // novo para o leave atrasado do sid velho não apagar a sessão nova.
    let sidDirty = false;
    let staleDelta = false;

    if (delta?.kind === "add") {
      // sid registra fora do toOccupant — join sem name (metadata quebrada)
      // ainda é uma sessão nova e precisa ancorar o stale-check do leave.
      const identity = delta.participant?.identity;
      const sid = delta.participant?.sid;
      if (identity && sid !== undefined && sids.get(identity) !== sid) {
        sids.set(identity, sid);
        sidDirty = true;
      }
      const parsed = toOccupant(delta.participant);
      if (parsed) {
        const current = occupants.get(parsed.identity);
        if (current) {
          if (current.name !== parsed.occupant.name || current.avatarUrl !== parsed.occupant.avatarUrl) {
            occupants.set(parsed.identity, parsed.occupant);
            changed = true;
          }
        } else if (occupants.size < SHARED_LIMITS.OCCUPANT_PREVIEW_MAX) {
          occupants.set(parsed.identity, parsed.occupant);
          changed = true;
        }
      }
    } else if (delta?.kind === "remove" && delta.identity !== undefined) {
      // sid do evento diverge do registrado = sessão morta — não apaga.
      // Occupant e sharer são checados contra SEUS sids: publish que chega
      // antes do join registra em sharers sem tocar sids.
      const knownSid = sids.get(delta.identity);
      const staleOccupant =
        delta.sid !== undefined && knownSid !== undefined && delta.sid !== knownSid;
      const shareSid = sharers.get(delta.identity);
      const staleSharer =
        delta.sid !== undefined &&
        shareSid !== undefined &&
        shareSid !== "" &&
        delta.sid !== shareSid;
      staleDelta = staleOccupant;
      if (!staleOccupant) {
        if (occupants.delete(delta.identity)) changed = true;
        if (sids.delete(delta.identity)) sidDirty = true;
      }
      if (!staleSharer) {
        if (sharers.delete(delta.identity)) changed = true;
      }
    }
    if (staleDelta) {
      // Evento de sessão morta descreve a sala no momento daquele leave —
      // nenhum count dele é autoridade sobre a sessão nova (o trim com
      // count atrasado despejava o occupant do rejoin).
      participantCount = prev?.participantCount ?? participantCount;
    }
    // Count absoluto menor que occupants conhecidos = um leave se perdeu.
    // Só em remove/sem-delta: join pode trazer count defasado do snapshot
    // e cortaria um occupant real recém-adicionado. Sharers ficam por
    // último — remover quem transmite por um count defasado é pior.
    if (delta?.kind !== "add" && participantCount > 0 && occupants.size > participantCount) {
      for (const identity of occupants.keys()) {
        if (occupants.size <= participantCount) break;
        if (sharers.has(identity)) continue;
        occupants.delete(identity);
        if (sids.delete(identity)) sidDirty = true;
        changed = true;
      }
    }
    if (participantCount === 0 && (occupants.size > 0 || sharers.size > 0)) {
      occupants.clear();
      sharers.clear();
      if (sids.size > 0) sidDirty = true;
      sids.clear();
      changed = true;
    }

    // numPublishers de evento stale descreve a sala no momento do leave
    // velho — não é autoridade sobre a sessão nova.
    const hintInput = staleDelta ? undefined : liveHint;
    const nextHint = hintInput ?? (participantCount === 0 ? false : (prev?.liveHint ?? false));
    if (hintInput !== undefined) {
      if (nextHint !== (prev?.liveHint ?? false)) changed = true;
      // reconcile é autoridade: numPublishers=0 zera sharers que ficaram
      // stale por um track_unpublished perdido.
      if (!nextHint && sharers.size > 0) {
        sharers.clear();
        changed = true;
      }
    }

    const live = sharers.size > 0 || nextHint;
    const prevCount = prev?.participantCount ?? 0;
    const visibleChanged =
      prevCount !== participantCount || changed || live !== (prev ? isLive(prev) : false);
    if (!visibleChanged) {
      // Rejoin invisível (mesmo nome/avatar): nada a broadcastar, mas o sid
      // novo precisa persistir — senão o leave atrasado do sid velho apaga
      // a sessão nova como se fosse a atual.
      if (sidDirty || !prev) {
        this.entries.set(slug, { slug, participantCount, occupants, sids, sharers, liveHint: nextHint });
      }
      return;
    }
    const entry = { slug, participantCount, occupants, sids, sharers, liveHint: nextHint };
    this.entries.set(slug, entry);
    this.broadcast(slug, participantCount, markedOccupants(entry), live);
  }

  private setSharing(slug: string, identity: string, sharing: boolean, sid?: string): void {
    const entry = this.entries.get(slug);
    if (!entry) return;
    let changed: boolean;
    if (sharing) {
      // Publish de sessão morta (sid diverge do registrado) não pode
      // sobrescrever — senão o unpublish real da sessão nova viraria
      // "stale" e o badge ficava preso. Publish antes do join ancora o sid.
      const knownSid = entry.sids.get(identity);
      if (sid !== undefined && knownSid !== undefined && sid !== knownSid) return;
      changed = !entry.sharers.has(identity);
      if (sid !== undefined) {
        entry.sharers.set(identity, sid);
        if (knownSid === undefined) entry.sids.set(identity, sid);
      } else if (changed) {
        entry.sharers.set(identity, "");
      }
    } else {
      // unpublish de sessão morta não apaga o sharer da sessão nova.
      const storedSid = entry.sharers.get(identity);
      const stale =
        sid !== undefined && storedSid !== undefined && storedSid !== "" && storedSid !== sid;
      changed = !stale && entry.sharers.delete(identity);
      // hint seedado não tem identity: sem sharers conhecidos, o unpublish
      // recebido é a evidência de que o último publisher parou. Evento
      // stale não é evidência — não toca no hint.
      if (!stale && entry.sharers.size === 0 && entry.liveHint) {
        entry.liveHint = false;
        changed = true;
      }
    }
    // Broadcast mesmo quando `live` não muda: um segundo sharer (ou um
    // sharer parando com outro ainda ativo) muda a flag `sharing` dos
    // occupants — payload novo precisa chegar aos clientes.
    const live = isLive(entry);
    if (!changed) return;
    this.broadcast(slug, entry.participantCount, markedOccupants(entry), live);
  }

  private remove(slug: string): void {
    const prev = this.entries.get(slug);
    if (!prev) return;
    this.entries.delete(slug);
    if (prev.participantCount > 0 || isLive(prev)) this.broadcast(slug, 0, [], false);
  }

  private broadcast(slug: string, participantCount: number, occupants: Occupant[], live: boolean): void {
    this.events.broadcast({
      type: "rooms_updated",
      room: slug,
      live,
      participantCount,
      occupants,
    });
  }
}
