export interface VideoCard {
  participantSid: string;
  identity: string;
  name: string;
  isLocal: boolean;
  isScreenShare: boolean;
  avatarUrl?: string | null;
}

export interface AvailableStream {
  participantSid: string;
  identity: string;
  name: string;
  isLocal: boolean;
  avatarUrl: string | null;
}

export interface StreamViewer {
  name: string;
  identity: string;
  avatarUrl: string | null;
}

export interface RoomParticipant {
  sid: string;
  name: string;
  isLocal: boolean;
  avatarUrl: string | null;
}

export type ViewQuality = "auto" | "high" | "medium" | "low";
export type UploadQuality = "720" | "480" | "360" | "144";
export type UploadFps = "30" | "15";

export type DisconnectState = "" | "duplicate_identity" | "disconnected";
