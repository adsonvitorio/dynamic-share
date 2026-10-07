import {
  DisconnectReason,
  Room,
  RoomEvent,
  type LocalTrackPublication,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import {
  ErrorCodes,
  tokenResponseSchema,
  type TokenResponse,
} from "@share/shared";
import { api } from "$lib/api/client";
import { auth } from "$lib/auth/auth.svelte";
import { API, LIVEKIT, ROOM_UI } from "$lib/constants";
import { detachAllAudio } from "$lib/utils/audio";
import { createLogger } from "$lib/utils/logger";
import type { DisconnectState } from "./types";

const log = createLogger("LiveKit");

function decodeTokenExp(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // JWT é base64url — atob do browser rejeita '-' e '_' sem normalização.
    const payload = JSON.parse(
      atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// SDK 2.22 não expõe API pública de refresh — o engine lê `token` a cada
// tentativa de reconnect (resume/rejoin). Escrever o campo TS-private é o
// caminho para o reconnect sair com credencial válida.
function applyRefreshedToken(room: Room, token: string): void {
  (room.engine as unknown as { token?: string }).token = token;
}

export interface RoomEventHandlers {
  onTrackPublished: (pub: RemoteTrackPublication, participant: Participant) => void;
  onTrackUnpublished: (pub: RemoteTrackPublication, participant: Participant) => void;
  onTrackSubscribed: (track: RemoteTrack, pub: TrackPublication, participant: Participant) => void;
  onTrackUnsubscribed: (track: RemoteTrack, pub: TrackPublication, participant: Participant) => void;
  onTrackMuted: (pub: TrackPublication, participant: Participant) => void;
  onTrackUnmuted: (pub: TrackPublication, participant: Participant) => void;
  onLocalTrackPublished: (pub: LocalTrackPublication, participant: Participant) => void;
  onLocalTrackUnpublished: (pub: LocalTrackPublication, participant: Participant) => void;
  onParticipantConnected: (participant: Participant) => void;
  onParticipantDisconnected: (participant: Participant) => void;
  onParticipantMetadataChanged: (participant: Participant) => void;
  onDataReceived: (payload: Uint8Array, participant: Participant | undefined) => void;
  onTerminated?: () => void;
}

class ConnectionStore {
  room = $state<Room | null>(null);
  loading = $state(true);
  connecting = $state(false);
  error = $state("");
  errorCode = $state("");
  disconnectedReason = $state<DisconnectState>("");
  reconnecting = $state(false);

  userName = $derived(auth.user?.name ?? ROOM_UI.DEFAULT_LOCAL_NAME);
  private handlers: RoomEventHandlers | null = null;
  private connectPromise: Promise<void> | null = null;
  private destroyPromise: Promise<void> | null = null;
  private destroyRequested = false;
  private checkAuthPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshRetry = 0;
  private refreshExpAt = 0;
  private currentRoom: string | null = null;
  private wantedRoom: string | null = null;

  setHandlers(handlers: RoomEventHandlers): void {
    this.handlers = handlers;
  }

  async connect(roomName: string): Promise<void> {
    // Dedup só para a MESMA sala — connect(B) durante connect(A) em voo
    // enfileira atrás dele; herdar a promise do A deixava B sem conectar
    // (loading=false + room=null = página em branco "travada").
    if (this.connectPromise && this.wantedRoom === roomName) return this.connectPromise;
    this.wantedRoom = roomName;
    const prev = this.connectPromise;
    const p = (async () => {
      if (prev) await prev.catch(() => {});
      await this.runConnect(roomName);
    })();
    this.connectPromise = p;
    const clear = () => {
      if (this.connectPromise === p) this.connectPromise = null;
    };
    p.then(clear, clear);
    return p;
  }

  private async runConnect(roomName: string): Promise<void> {
    if (this.destroyPromise) {
      try {
        await this.destroyPromise;
      } catch (err) {
        log.warn("destroy_anterior_falhou", err);
      }
    }
    // destroy() ou um connect mais novo venceram enquanto este esperava
    // na fila — conectar agora criaria participante fantasma na sala.
    if (this.wantedRoom !== roomName) return;
    await this.doConnect(roomName);
  }

  private async doConnect(roomName: string): Promise<void> {
    this.destroyRequested = false;
    this.cancelTokenRefresh();
    this.loading = true;
    this.connecting = true;
    this.reconnecting = false;
    this.error = "";
    this.errorCode = "";
    this.disconnectedReason = "";

    let pendingRoom: Room | null = null;

    try {
      if (this.room) {
        await this.disconnect();
        this.room = null;
      }

      const tokenRes = await api.get<TokenResponse>(
        `${API.TOKEN}?room=${encodeURIComponent(roomName)}`,
      );
      if (!tokenRes.ok) {
        if (tokenRes.error.error === ErrorCodes.SESSION_REPLACED) {
          auth.markSessionReplaced();
        } else {
          this.errorCode = tokenRes.error.error;
          this.error = tokenRes.error.message;
        }
        this.loading = false;
        this.connecting = false;
        return;
      }

      const parsed = tokenResponseSchema.safeParse(tokenRes.data);
      if (!parsed.success) {
        log.warn("token_bad_shape");
        this.error = "Resposta inválida do servidor";
        this.loading = false;
        this.connecting = false;
        return;
      }

      pendingRoom = new Room(LIVEKIT.ROOM_CONFIG);
      await pendingRoom.connect(parsed.data.url, parsed.data.token, {
        autoSubscribe: LIVEKIT.ROOM_CONFIG.autoSubscribe,
      });
      // destroy() ou um connect mais novo supersederam este enquanto o
      // handshake estava em voo — a room órfã é descartada, nunca entra
      // em this.room (senão ela viveria como participante fantasma).
      if (this.destroyRequested || this.wantedRoom !== roomName) {
        try {
          await pendingRoom.disconnect();
        } catch (e) {
          log.warn("orphan_disconnect_failed", e);
        }
        pendingRoom = null;
        this.loading = false;
        this.connecting = false;
        return;
      }
      this.room = pendingRoom;
      pendingRoom = null;
      log.info("connected");

      this.currentRoom = roomName;
      this.scheduleTokenRefresh(parsed.data.token);
      this.setupEventListeners();
      this.loading = false;
      this.connecting = false;
    } catch (err) {
      log.error("connect_failed", err);
      this.error = err instanceof Error ? err.message : "Erro ao conectar";
      if (pendingRoom) {
        try {
          await pendingRoom.disconnect();
        } catch (disconnectErr) {
          log.warn("pending_disconnect_failed", disconnectErr);
        }
        pendingRoom = null;
      }
      if (this.room) {
        try {
          // removeAllListeners como no disconnect() — sem ele um
          // Disconnected tardio da room morta dispararia onTerminated e
          // escreveria disconnectedReason por cima do erro real.
          this.room.removeAllListeners();
          await this.room.disconnect();
        } catch (disconnectErr) {
          log.warn("assigned_disconnect_failed", disconnectErr);
        }
        this.room = null;
      }
      this.loading = false;
      this.connecting = false;
    }
  }

  private async disconnect(): Promise<void> {
    if (this.room) {
      try {
        this.room.removeAllListeners();
        await this.room.disconnect();
      } catch (err) {
        log.warn("disconnect_failed", err);
      }
    }
    this.cancelTokenRefresh();
  }

  private scheduleTokenRefresh(jwt: string): void {
    this.cancelTokenRefresh();
    const exp = decodeTokenExp(jwt);
    if (exp === null) {
      log.warn("token_sem_exp");
      return;
    }
    this.refreshExpAt = exp * 1000;
    const delay = Math.max(
      this.refreshExpAt - Date.now() - LIVEKIT.TOKEN_REFRESH_MARGIN_MS,
      0,
    );
    const room = this.room;
    this.refreshTimer = setTimeout(() => void this.refreshToken(room), delay);
  }

  private async refreshToken(room: Room | null): Promise<void> {
    if (!room || this.room !== room || !this.currentRoom) return;
    const slug = this.currentRoom;
    const res = await api.get<TokenResponse>(
      `${API.TOKEN}?room=${encodeURIComponent(slug)}`,
    );
    if (this.room !== room) return;
    if (!res.ok) {
      const code = res.error.error;
      if (code === ErrorCodes.SESSION_REPLACED) {
        auth.markSessionReplaced();
        return;
      }
      if (code === ErrorCodes.SESSION_EXPIRED) {
        this.recheckAuth();
        return;
      }
      this.scheduleRetry(room);
      return;
    }
    const parsed = tokenResponseSchema.safeParse(res.data);
    if (!parsed.success) {
      log.warn("token_refresh_bad_shape");
      this.scheduleRetry(room);
      return;
    }
    this.refreshRetry = 0;
    applyRefreshedToken(room, parsed.data.token);
    this.scheduleTokenRefresh(parsed.data.token);
  }

  // Retry para de fazer sentido após o exp — o token antigo já morreu
  // e o kick do server é terminal (NotAllowed não-recuperável).
  private scheduleRetry(room: Room): void {
    if (
      this.refreshRetry < LIVEKIT.TOKEN_REFRESH_RETRIES &&
      Date.now() < this.refreshExpAt
    ) {
      this.refreshRetry += 1;
      this.refreshTimer = setTimeout(
        () => void this.refreshToken(room),
        LIVEKIT.TOKEN_REFRESH_RETRY_MS,
      );
    } else {
      log.warn("token_refresh_retries_exhausted");
    }
  }

  private cancelTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshRetry = 0;
    this.refreshExpAt = 0;
  }

  private recheckAuth(): void {
    if (!this.checkAuthPromise) {
      this.checkAuthPromise = auth.checkAuth();
      this.checkAuthPromise
        .catch((err) => log.warn("recheck_auth_failed", err))
        .finally(() => {
          this.checkAuthPromise = null;
        });
    }
  }

  async logout(): Promise<void> {
    // Aborta connects em voo/enfileirados — um doConnect no meio do logout
    // atribuiria this.room depois do disconnect (fantasma até o unmount).
    this.wantedRoom = null;
    this.destroyRequested = true;
    await this.disconnect();
    this.room = null;
    detachAllAudio();
    await auth.logout();
  }

  private setupEventListeners(): void {
    if (!this.room || !this.handlers) return;
    const r = this.room;
    const h = this.handlers;

    r.on(RoomEvent.TrackPublished, (pub, participant) => h.onTrackPublished(pub, participant));
    r.on(RoomEvent.TrackUnpublished, (pub, participant) => h.onTrackUnpublished(pub, participant));
    r.on(RoomEvent.TrackSubscribed, (track, pub, participant) =>
      h.onTrackSubscribed(track, pub, participant),
    );
    r.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) =>
      h.onTrackUnsubscribed(track, pub, participant),
    );
    r.on(RoomEvent.TrackMuted, (pub, participant) =>
      h.onTrackMuted(pub, participant),
    );
    r.on(RoomEvent.TrackUnmuted, (pub, participant) =>
      h.onTrackUnmuted(pub, participant),
    );
    r.on(RoomEvent.LocalTrackPublished, (pub, participant) =>
      h.onLocalTrackPublished(pub, participant),
    );
    r.on(RoomEvent.LocalTrackUnpublished, (pub, participant) =>
      h.onLocalTrackUnpublished(pub, participant),
    );
    r.on(RoomEvent.ParticipantConnected, (participant) =>
      h.onParticipantConnected(participant),
    );
    r.on(RoomEvent.ParticipantDisconnected, (participant) =>
      h.onParticipantDisconnected(participant),
    );
    r.on(RoomEvent.ParticipantMetadataChanged, (_prev, participant) =>
      h.onParticipantMetadataChanged(participant),
    );
    r.on(RoomEvent.Reconnecting, () => {
      this.reconnecting = true;
    });
    r.on(RoomEvent.SignalReconnecting, () => {
      this.reconnecting = true;
    });
    r.on(RoomEvent.Reconnected, () => {
      this.reconnecting = false;
    });
    r.on(RoomEvent.Disconnected, (reason) => {
      this.reconnecting = false;
      // Disconnect terminal mata a sala — refresh sobre room morta só
      // gastaria requests (e renovaria a sessão de um tab inativo).
      this.cancelTokenRefresh();
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        this.disconnectedReason = "duplicate_identity";
        this.recheckAuth();
      } else if (!this.destroyRequested) {
        log.warn("room_disconnected", { reason });
        this.disconnectedReason = "disconnected";
      }
      // Kick terminal (duplicate_identity/shutdown) não emite
      // LocalTrackUnpublished para as tracks que o server derrubou —
      // sem o reset os cards/sharing ficavam congelados na stage.
      if (!this.destroyRequested) h.onTerminated?.();
    });
    r.on(RoomEvent.DataReceived, (payload, participant) =>
      h.onDataReceived(payload, participant),
    );
  }

  async destroy(): Promise<void> {
    // Aborta connects enfileirados — sem isso um connect esperando na
    // fila conectava uma sala que o usuário já saiu (fantasma no LiveKit).
    this.wantedRoom = null;
    this.destroyRequested = true;
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyPromise = this.doDestroy();
    try {
      await this.destroyPromise;
    } finally {
      this.destroyPromise = null;
    }
  }

  private async doDestroy(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.error = "";
    this.errorCode = "";
    this.currentRoom = null;
    this.reconnecting = false;
    // Estado neutro — senão a próxima entrada renderiza a tela de erro
    // stale enquanto o connect ainda está em await.
    this.disconnectedReason = "";
    this.loading = true;
    this.cancelTokenRefresh();
    detachAllAudio();
    if (room) {
      try {
        room.removeAllListeners();
        await room.disconnect();
      } catch (err) {
        log.warn("destroy_disconnect_failed", err);
      }
    }
  }
}

export const connectionStore = new ConnectionStore();
