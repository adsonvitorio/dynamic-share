import { NOTIFY, copy, type SoundEvent } from "$lib/constants";
import { playEventSound } from "$lib/utils/notify-sound";

export type PresenceKind =
  | "room_join"
  | "room_leave"
  | "viewer_join"
  | "viewer_leave"
  | "coviewer_join"
  | "coviewer_leave"
  | "share_start"
  | "share_stop";

export interface PresencePerson {
  name: string;
  avatarUrl: string | null;
}

export interface PresenceToast {
  id: number;
  kind: PresenceKind;
  people: PresencePerson[];
  text: string;
}

const SOUND_FOR_KIND: Record<PresenceKind, SoundEvent> = {
  room_join: "roomJoin",
  room_leave: "roomLeave",
  viewer_join: "viewerJoin",
  viewer_leave: "viewerLeave",
  coviewer_join: "viewerJoin",
  coviewer_leave: "viewerLeave",
  share_start: "shareStart",
  share_stop: "shareStop",
};

function namesLabel(people: PresencePerson[]): string {
  const first = people[0]?.name ?? "";
  const extra = people.length - 1;
  return extra > 0 ? `${first} +${extra}` : first;
}

function toastText(kind: PresenceKind, people: PresencePerson[]): string {
  const names = namesLabel(people);
  switch (kind) {
    case "room_join":
      return copy.toastJoin(names);
    case "room_leave":
      return copy.toastLeave(names);
    case "viewer_join":
      return copy.toastWatch(names);
    case "viewer_leave":
      return copy.toastUnwatch(names);
    case "coviewer_join":
      return copy.toastCoWatch(names);
    case "coviewer_leave":
      return copy.toastCoUnwatch(names);
    case "share_start":
      return copy.toastShareStart(names);
    case "share_stop":
      return copy.toastShareStop(names);
  }
}

class NotificationsStore {
  toasts = $state<PresenceToast[]>([]);
  announcement = $state("");

  private nextId = 0;
  private pending = new Map<PresenceKind, PresencePerson[]>();
  private flushTimers = new Map<PresenceKind, ReturnType<typeof setTimeout>>();
  private ttlTimers = new Map<number, ReturnType<typeof setTimeout>>();

  notify(kind: PresenceKind, person: PresencePerson): void {
    const people = this.pending.get(kind) ?? [];
    if (people.length < NOTIFY.GROUP_CAP) {
      people.push(person);
      this.pending.set(kind, people);
    }
    if (this.flushTimers.has(kind)) return;
    this.flushTimers.set(
      kind,
      setTimeout(() => this.flush(kind), NOTIFY.GROUP_WINDOW_MS),
    );
  }

  dismiss(id: number): void {
    const timer = this.ttlTimers.get(id);
    if (timer) clearTimeout(timer);
    this.ttlTimers.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  private flush(kind: PresenceKind): void {
    this.flushTimers.delete(kind);
    const people = this.pending.get(kind) ?? [];
    this.pending.delete(kind);
    if (people.length === 0) return;

    void playEventSound(SOUND_FOR_KIND[kind]);

    const id = ++this.nextId;
    const text = toastText(kind, people);
    this.toasts = [...this.toasts, { id, kind, people, text }].slice(-NOTIFY.TOAST_CAP);
    this.ttlTimers.set(
      id,
      setTimeout(() => this.dismiss(id), NOTIFY.TOAST_TTL_MS),
    );
    this.announcement = text;
  }

  reset(): void {
    for (const timer of this.flushTimers.values()) clearTimeout(timer);
    for (const timer of this.ttlTimers.values()) clearTimeout(timer);
    this.flushTimers.clear();
    this.ttlTimers.clear();
    this.pending.clear();
    this.toasts = [];
    this.announcement = "";
  }
}

export const notifications = new NotificationsStore();
