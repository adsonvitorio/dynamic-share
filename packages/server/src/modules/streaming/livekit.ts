import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
  type ParticipantInfo,
  type WebhookEvent,
} from "livekit-server-sdk";
import { createLogger } from "../../core/logging/logger.js";
import { maskedId } from "../../core/logging/pii.js";

const log = createLogger("LiveKit");

export interface RoomSummary {
  name: string;
  numParticipants: number;
  numPublishers: number;
}

export interface TokenOptions {
  room: string;
  identity: string;
  name: string;
  metadata: string;
  ttlSec: number;
}

export class LiveKitService {
  private client: RoomServiceClient;
  private webhookReceiver: WebhookReceiver;
  private roomLocks = new Map<string, Promise<RoomSummary[]>>();

  constructor(
    url: string,
    private apiKey: string,
    private apiSecret: string,
    private roomEmptyTimeoutSec: number,
  ) {
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      throw new Error(`LIVEKIT_URL deve começar com ws:// ou wss:// (recebeu "${url}")`);
    }
    const apiUrl = url.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
    this.client = new RoomServiceClient(apiUrl, apiKey, apiSecret);
    this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
  }

  /**
   * Estado real de participantes de uma sala — occupants/sharers
   * autoritativos para o reconcile de presença (cobre webhooks
   * perdidos e restart do server).
   */
  async listParticipants(roomName: string): Promise<ParticipantInfo[]> {
    return this.client.listParticipants(roomName);
  }

  /**
   * Revogação ativa: o JWT emitido segue válido até o exp — sem o kick, um
   * token capturado antes do logout/expiração/revogação continuaria entrando
   * nas salas. Remove o participante de todas as salas onde estiver.
   */
  async kickParticipant(identity: string): Promise<void> {
    try {
      const rooms = await this.listRooms();
      await Promise.allSettled(
        rooms.map((r) => this.client.removeParticipant(r.name, identity)),
      );
    } catch (err) {
      log.warn("kick_participant_failed", { err });
    }
  }

  /** Kick pontual numa sala — gate do participant_joined sem sessão viva. */
  async removeParticipantFrom(roomName: string, identity: string): Promise<void> {
    try {
      await this.client.removeParticipant(roomName, identity);
      log.info("participant_removed", { room: roomName, identity: maskedId(identity) });
    } catch (err) {
      log.warn("remove_participant_failed", { room: roomName, err });
    }
  }

  private async listRooms(): Promise<RoomSummary[]> {
    const rooms = await this.client.listRooms();
    return rooms.map((r) => ({
      name: r.name,
      numParticipants: r.numParticipants,
      numPublishers: r.numPublishers,
    }));
  }

  /**
   * Garante que a sala existe e retorna o snapshot de salas observado.
   * Lock por nome evita criação dupla em joins simultâneos; o snapshot
   * retornado alimenta o reconcile de presença sem chamada Twirp extra.
   */
  async ensureRoom(name: string): Promise<RoomSummary[]> {
    const existing = this.roomLocks.get(name);
    if (existing) return existing;

    const lock = (async () => {
      const rooms = await this.listRooms();
      if (rooms.some((r) => r.name === name)) return rooms;
      await this.client.createRoom({ name, emptyTimeout: this.roomEmptyTimeoutSec });
      log.info("room_created", { room: name });
      return [...rooms, { name, numParticipants: 0, numPublishers: 0 }];
    })();

    this.roomLocks.set(name, lock);
    try {
      return await lock;
    } finally {
      this.roomLocks.delete(name);
    }
  }

  async generateToken(opts: TokenOptions): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: opts.identity,
      name: opts.name,
      ttl: opts.ttlSec,
      metadata: opts.metadata,
    });
    token.addGrant({
      room: opts.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // canPublish sem canPublishSources permite mic/câmera — o produto é
      // só screen share; restringe no grant, não só na UI.
      canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
    });
    return await token.toJwt();
  }

  async verifyWebhook(body: Buffer, authHeader?: string): Promise<WebhookEvent> {
    return await this.webhookReceiver.receive(body.toString(), authHeader);
  }
}
