import { sseEventSchema, type AuthMeResponse, type SseEvent } from "@share/shared";
import { api } from "$lib/api/client";
import { API, ROUTES, SSE } from "$lib/constants";
import { createLogger } from "$lib/utils/logger";

const log = createLogger("Auth");

export type AuthStatus =
  | "unchecked"
  | "authenticated"
  | "unauthenticated"
  | "session_replaced"
  | "error";

export interface AuthUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

type SseHandler = (data: SseEvent) => void;

class AuthStore {
  status: AuthStatus = $state("unchecked");
  user: AuthUser | null = $state(null);
  private events: EventSource | null = null;
  private checkPromise: Promise<void> | null = null;
  private sseHandlers = new Map<string, Set<SseHandler>>();
  private sseOpenHandlers = new Set<() => void>();
  private sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private sseRetryIndex = 0;
  private sseNeedsResync = false;

  constructor() {
    this.onSseEvent("session_replaced", () => this.markSessionReplaced());
    this.onSseEvent("profile_updated", (data) => {
      if (data.type !== "profile_updated" || !this.user) return;
      this.user = { ...this.user, name: data.name, avatarUrl: data.avatarUrl };
    });
  }

  onSseEvent(type: string, fn: SseHandler): () => void {
    let set = this.sseHandlers.get(type);
    if (!set) {
      set = new Set();
      this.sseHandlers.set(type, set);
      this.events?.addEventListener(type, this.dispatchSse);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  onSseOpen(fn: () => void): () => void {
    this.sseOpenHandlers.add(fn);
    return () => {
      this.sseOpenHandlers.delete(fn);
    };
  }

  private dispatchSse = (ev: MessageEvent): void => {
    let raw: unknown;
    try {
      raw = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      log.warn("sse_event_parse_failed", { type: ev.type });
      return;
    }
    const parsed = sseEventSchema.safeParse(raw);
    if (!parsed.success) {
      log.warn("sse_event_invalid", { type: ev.type });
      return;
    }
    for (const fn of this.sseHandlers.get(parsed.data.type) ?? []) {
      fn(parsed.data);
    }
  };

  checkAuth(): Promise<void> {
    this.checkPromise ??= this.doCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  markSessionReplaced(): void {
    if (this.status === "session_replaced") return;
    this.status = "session_replaced";
    this.user = null;
    this.closeEvents();
  }

  async logout(): Promise<void> {
    await api.post(API.AUTH_LOGOUT);
    this.setUnauthenticated();
    window.location.href = `${ROUTES.LOGIN}?reason=logged_out`;
  }

  private async doCheck(): Promise<void> {
    const res = await api.get<AuthMeResponse>(API.AUTH_ME);
    if (res.ok) {
      if (res.data.authenticated && res.data.user) {
        this.user = res.data.user;
        this.status = "authenticated";
        this.openEvents();
      } else {
        this.setUnauthenticated();
      }
      return;
    }
    if (res.error.error === "session_replaced") {
      this.markSessionReplaced();
      return;
    }
    if (res.error.error === "session_expired") {
      this.setUnauthenticated();
      return;
    }
    this.status = "error";
  }

  private setUnauthenticated(): void {
    this.status = "unauthenticated";
    this.user = null;
    this.closeEvents();
  }

  private openEvents(): void {
    if (this.events) return;
    const events = new EventSource(API.EVENTS);
    for (const type of this.sseHandlers.keys()) {
      events.addEventListener(type, this.dispatchSse);
    }
    events.onopen = () => {
      this.sseRetryIndex = 0;
      if (!this.sseNeedsResync) return;
      this.sseNeedsResync = false;
      for (const fn of this.sseOpenHandlers) fn();
    };
    events.onerror = () => {
      this.sseNeedsResync = true;
      if (events.readyState !== EventSource.CLOSED) return;
      if (this.events === events) this.events = null;
      this.scheduleSseReconnect();
    };
    this.events = events;
  }

  private scheduleSseReconnect(): void {
    if (this.sseRetryTimer || this.status !== "authenticated") return;
    const delays = SSE.RECONNECT_DELAYS_MS;
    const delay = delays[Math.min(this.sseRetryIndex, delays.length - 1)]!;
    this.sseRetryIndex += 1;
    log.warn("sse_reconnect_scheduled", { delay_ms: delay });
    this.sseRetryTimer = setTimeout(() => {
      this.sseRetryTimer = null;
      if (this.status !== "authenticated" || this.events) return;
      this.checkAuth().catch((err) => log.warn("sse_reconnect_failed", err));
    }, delay);
  }

  private closeEvents(): void {
    if (this.sseRetryTimer) {
      clearTimeout(this.sseRetryTimer);
      this.sseRetryTimer = null;
    }
    this.events?.close();
    this.events = null;
  }
}

export const auth = new AuthStore();
