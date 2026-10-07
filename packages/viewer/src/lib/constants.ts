import { VideoQuality } from "livekit-client";
import type { UploadFps, UploadQuality, ViewQuality } from "$lib/room/types";

export const API = {
  STATUS: "/api/status",
  ROOMS: "/api/rooms",
  TOKEN: "/api/token",
  AUTH_ME: "/api/auth/me",
  AUTH_LOGOUT: "/api/auth/logout",
  AUTH_DISCORD_LOGIN: "/api/auth/discord/login",
  EVENTS: "/api/events",
  FETCH_TIMEOUT_MS: 12_000,
} as const;

export const BRAND = {
  NAME: "Dynamic Share",
  LOGO_URL: "/brand/logo.svg",
} as const;

export const ROUTES = {
  LOGIN: "/login",
  ROOMS: "/rooms",
} as const;

export const SSE = {
  RECONNECT_DELAYS_MS: [1_000, 3_000, 10_000, 30_000],
} as const;

export const UI = {
  ORB_COUNT: 3,
} as const;

export const RAILS = {
  OCCUPANT_STACK_MAX: 8,
  MEMBER_STACK_MAX: 5,
} as const;

export const copy = {
    navLabel: "Salas",
    roomsTitle: "Salas",
    liveBadge: "AO VIVO",
    joinHint: "Entrar",
    connectedAs: "Conectado",
    logout: "Sair",
    emptyRooms: "Nenhuma sala no lobby",
    hubEmpty: "O lobby está vazio por enquanto — volte em breve.",
    hubError: "Não foi possível carregar as salas.",
    retry: "Tentar de novo",
    membersTitle: "Squad",
    youLabel: "Você",
    leaveRoom: "Sair da sala",
    shareScreen: "Compartilhar",
    shareStarting: "Iniciando…",
    stopShare: "Parar",
    shareAudioUnavailable:
      "Sem áudio — o navegador não libera áudio de tela ou a opção ficou desmarcada ao compartilhar",
    openLabel: "Abrir transmissão",
    watchStream: "Assistir",
    unwatch: "Parar de assistir",
    streamConnecting: "Conectando…",
    fullscreenLabel: "Tela cheia",
    exitFullscreen: "Sair de tela cheia",
    pipLabel: "Picture-in-Picture",
    welcomeTitle: "Pronto para o próximo round?",
    welcomeHint: "Escolha uma sala e entre na partida.",
    loginTagline: "Suas transmissões, em um só lobby",
    stageEmptyTitle: "Nenhuma transmissão por aqui",
    stageEmptyMessage: "Quando alguém compartilhar a tela, a transmissão aparece aqui.",
    statusConnectTitle: "Servidor fora do ar",
    statusConnectDesc: "Não conseguimos alcançar o servidor. Tente novamente em instantes.",
    statusPausedTitle: "Em manutenção",
    statusPausedDesc: (name: string) =>
      `O ${name} está pausado temporariamente. Voltamos em breve.`,
    statusReplacedTitle: "Sessão substituída",
    statusReplacedDesc:
      "Sua conta conectou em outro lugar. Esta sessão foi encerrada.",
    statusAuthTitle: "Não conseguimos validar sua sessão",
    statusRoomClosedTitle: "Esta sala já está ocupada",
    statusRoomClosedDesc:
      "Você abriu esta sala em outra aba ou dispositivo. Apenas uma conexão por conta.",
    statusLostTitle: "Conexão perdida",
    statusLostDesc:
      "A conexão com a sala caiu. Verifique sua internet e tente novamente.",
    statusRoomNotFoundTitle: "Sala não encontrada",
    statusRoomNotFoundDesc:
      "A sala que você procura não existe ou já foi encerrada. Escolha outra no lobby.",
    statusErrorTitle: "Algo deu errado",
    loginReasons: {
      expired: "Sua sessão expirou. Entre novamente.",
      session_replaced: "Sua conta conectou em outro lugar. Esta sessão foi encerrada.",
      logged_out: "Você saiu da conta.",
      not_authorized: "Sua conta não tem permissão para entrar aqui.",
      unavailable: "O serviço está indisponível. Tente em instantes.",
      invalid_state: "A tentativa de login expirou. Tente novamente.",
      oauth_denied: "A autorização no Discord foi cancelada.",
      oauth_failed: "Não foi possível concluir o login com o Discord.",
      unauthorized: "Você precisa entrar para continuar.",
    },
    liveNow: (n: number) => `${n} ${n === 1 ? "sala ao vivo" : "salas ao vivo"} agora`,
    viewers: (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`,
    toastJoin: (names: string) => `${names} entrou na sala`,
    toastLeave: (names: string) => `${names} saiu da sala`,
    toastWatch: (names: string) => `${names} está te assistindo`,
    toastUnwatch: (names: string) => `${names} parou de assistir`,
    toastCoWatch: (names: string) => `${names} também está assistindo`,
    toastCoUnwatch: (names: string) => `${names} parou de assistir junto`,
    toastShareStart: (names: string) => `${names} entrou ao vivo`,
    toastShareStop: (names: string) => `${names} saiu do ar`,
    sharingNow: "transmitindo",
    inRoomNow: (n: number) => `${n} na sala`,
    viewersWatching: (n: number) => `${n} assistindo`,
} as const;

export const LIVEKIT = {
  ROOM_CONFIG: {
    adaptiveStream: true,
    dynacast: true,
    autoSubscribe: false,
  },
  DATA_MESSAGE_TYPES: {
    UPLOAD_QUALITY: "upload-quality",
    UPLOAD_FPS: "upload-fps",
    VIEWERSHIP: "viewership",
    VIEWERSHIP_SYNC: "viewership-sync",
  },

  UPLOAD_QUALITY_OPTIONS: [
    { key: "720", label: "720p" },
    { key: "480", label: "480p" },
    { key: "360", label: "360p" },
    { key: "144", label: "144p" },
  ],
  VIEW_QUALITY_OPTIONS: [
    { key: "auto", label: "Auto" },
    { key: "high", label: "Alta" },
    { key: "medium", label: "Média" },
    { key: "low", label: "Baixa" },
  ],
  FPS_OPTIONS: [
    { key: "30", label: "30 FPS" },
    { key: "15", label: "15 FPS" },
  ],
  RESOLUTION_MAP: {
    "720": { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } },
    "480": { width: { ideal: 854, max: 854 }, height: { ideal: 480, max: 480 } },
    "360": { width: { ideal: 640, max: 640 }, height: { ideal: 360, max: 360 } },
    "144": { width: { ideal: 256, max: 256 }, height: { ideal: 144, max: 144 } },
  } satisfies Record<UploadQuality, { width: { ideal: number; max: number }; height: { ideal: number; max: number } }>,
  VIEW_QUALITY_MAP: {
    high: VideoQuality.HIGH,
    medium: VideoQuality.MEDIUM,
    low: VideoQuality.LOW,
  } satisfies Record<Exclude<ViewQuality, "auto">, VideoQuality>,
  DEFAULT_VIEW_QUALITY: "auto" as ViewQuality,
  DEFAULT_UPLOAD_QUALITY: "720" as UploadQuality,
  DEFAULT_UPLOAD_FPS: "30" as UploadFps,
  TOKEN_REFRESH_MARGIN_MS: 60_000,
  TOKEN_REFRESH_RETRIES: 3,
  TOKEN_REFRESH_RETRY_MS: 5_000,
  RAF_CANCEL_TIMEOUT_MS: 1000,
  VIEWERSHIP_REANNOUNCE_MS: 600,
  RAF_RETRY_MAX: 30,
  VIDEO_DIMS_POLL_MS: 250,
  VIDEO_CLASS_NORMAL: "w-full h-full object-contain",
  VIDEO_CLASS_THUMBNAIL: "w-full h-full object-cover",
  DEFAULT_ASPECT: { width: 16, height: 9 },
} as const;

export const ALLOWED_SCRIPT_SRC_PREFIXES = ["/"] as const;

export const ROOM_UI = {
  DEFAULT_LOCAL_NAME: "Você",
  DEFAULT_REMOTE_NAME: "Apresentador",
  LOCAL_PARTICIPANT_LABEL: "Você",
  REMOTE_PARTICIPANT_LABEL: "Participante",
  DEFAULT_VIEWER_BADGE_MAX: 5,
  AUDIO_VOLUME_MIN: 0,
  AUDIO_VOLUME_MAX: 1,
  AUDIO_VOLUME_STEP: 0.01,
  DISCORD_CDN_BASE: "https://cdn.discordapp.com",
  AVATAR_INITIALS_COUNT: 2,
  LIST_STAGGER_MS: 40,
} as const;

export interface SoundNote {
  at: number;
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
}

export type SoundEvent =
  | "streamOpen"
  | "streamClose"
  | "roomJoin"
  | "roomLeave"
  | "viewerJoin"
  | "viewerLeave"
  | "shareStart"
  | "shareStop";

export const SOUND_PATTERNS: Record<SoundEvent, readonly SoundNote[]> = {
  streamOpen: [
    { at: 0, freq: 587.33, dur: 0.09, type: "triangle", gain: 0.12 },
    { at: 0.08, freq: 880, dur: 0.16, type: "triangle", gain: 0.12 },
  ],
  streamClose: [
    { at: 0, freq: 392, dur: 0.12, type: "sine", gain: 0.11 },
    { at: 0.1, freq: 261.63, dur: 0.22, type: "sine", gain: 0.11 },
  ],
  roomJoin: [
    { at: 0, freq: 660, dur: 0.05, type: "square", gain: 0.06 },
    { at: 0.09, freq: 660, dur: 0.05, type: "square", gain: 0.06 },
  ],
  roomLeave: [{ at: 0, freq: 493.88, dur: 0.3, type: "sine", gain: 0.1, slideTo: 329.63 }],
  viewerJoin: [{ at: 0, freq: 740, dur: 0.07, type: "triangle", gain: 0.09 }],
  viewerLeave: [{ at: 0, freq: 329.63, dur: 0.14, type: "sine", gain: 0.08 }],
  shareStart: [
    { at: 0, freq: 523.25, dur: 0.09, type: "triangle", gain: 0.1 },
    { at: 0.08, freq: 659.25, dur: 0.09, type: "triangle", gain: 0.1 },
    { at: 0.16, freq: 783.99, dur: 0.2, type: "triangle", gain: 0.1 },
  ],
  shareStop: [
    { at: 0, freq: 783.99, dur: 0.09, type: "sine", gain: 0.1 },
    { at: 0.08, freq: 659.25, dur: 0.09, type: "sine", gain: 0.1 },
    { at: 0.16, freq: 523.25, dur: 0.26, type: "sine", gain: 0.1 },
  ],
};

export const SOUND = {
  BURST_WINDOW_MS: 800,
  FADE_IN_SEC: 0.01,
  PENDING_MAX_AGE_MS: 5_000,
  PATTERNS: SOUND_PATTERNS,
} as const;

export const NOTIFY = {
  TOAST_CAP: 3,
  TOAST_TTL_MS: 5_000,
  GROUP_WINDOW_MS: 1_200,
  GROUP_CAP: 6,
} as const;
