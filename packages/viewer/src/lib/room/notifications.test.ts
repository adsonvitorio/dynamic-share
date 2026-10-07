import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFY } from "$lib/constants";

const eventSound = vi.fn();
vi.mock("$lib/utils/notify-sound", () => ({
  playEventSound: eventSound,
}));

async function load() {
  vi.resetModules();
  const mod = await import("./notifications.svelte");
  return mod.notifications;
}

const person = (name: string) => ({ name, avatarUrl: null });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifications", () => {
  it("agrupa burst: N joins na janela → 1 toast, 1 som, 1 anúncio", async () => {
    const store = await load();
    store.notify("room_join", person("Ana"));
    store.notify("room_join", person("Bia"));
    store.notify("room_join", person("Cid"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].people).toHaveLength(3);
    expect(store.toasts[0].text).toContain("Ana");
    expect(eventSound).toHaveBeenCalledTimes(1);
    expect(eventSound).toHaveBeenCalledWith("roomJoin");
    expect(store.announcement).toBe(store.toasts[0].text);
  });

  it("kinds distintos geram toasts e sons distintos", async () => {
    const store = await load();
    store.notify("room_join", person("Ana"));
    store.notify("viewer_leave", person("Bia"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(2);
    expect(eventSound).toHaveBeenCalledWith("roomJoin");
    expect(eventSound).toHaveBeenCalledWith("viewerLeave");
  });

  it("respeita o cap de pessoas por grupo", async () => {
    const store = await load();
    for (let i = 0; i < NOTIFY.GROUP_CAP + 2; i++) {
      store.notify("room_join", person(`P${i}`));
    }
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0].people).toHaveLength(NOTIFY.GROUP_CAP);
    expect(store.toasts[0].text).toContain(`P0 +${NOTIFY.GROUP_CAP - 1}`);
  });

  it("respeita o cap de toasts visíveis", async () => {
    const store = await load();
    for (let i = 0; i < NOTIFY.TOAST_CAP + 2; i++) {
      store.notify("room_join", person(`P${i}`));
      vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    }
    expect(store.toasts.length).toBe(NOTIFY.TOAST_CAP);
  });

  it("toast expira sozinho após o TTL", async () => {
    const store = await load();
    store.notify("room_join", person("Ana"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(1);
    vi.advanceTimersByTime(NOTIFY.TOAST_TTL_MS + 10);
    expect(store.toasts).toHaveLength(0);
  });

  it("room_join usa texto de sala", async () => {
    const store = await load();
    store.notify("room_join", person("Ana"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts[0].text).toBe("Ana entrou na sala");
  });

  it("share_start/share_stop geram toast + som shareStart/shareStop", async () => {
    const store = await load();
    store.notify("share_start", person("Ana"));
    store.notify("share_stop", person("Bia"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(2);
    expect(store.toasts[0].text).toBe("Ana entrou ao vivo");
    expect(store.toasts[1].text).toBe("Bia saiu do ar");
    expect(eventSound).toHaveBeenCalledWith("shareStart");
    expect(eventSound).toHaveBeenCalledWith("shareStop");
  });

  it("coviewer_join/leave tocam som de viewer com copy distinta do apresentador", async () => {
    const store = await load();
    store.notify("viewer_join", person("Ana"));
    store.notify("coviewer_join", person("Ana"));
    store.notify("coviewer_leave", person("Bia"));
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + 10);
    expect(store.toasts).toHaveLength(3);
    expect(store.toasts[0].text).toBe("Ana está te assistindo");
    expect(store.toasts[1].text).toBe("Ana também está assistindo");
    expect(store.toasts[2].text).toBe("Bia parou de assistir junto");
    expect(eventSound).toHaveBeenCalledTimes(3);
    expect(eventSound).toHaveBeenNthCalledWith(2, "viewerJoin");
    expect(eventSound).toHaveBeenNthCalledWith(3, "viewerLeave");
  });

  it("reset limpa toasts, anúncio e timers pendentes", async () => {
    const store = await load();
    store.notify("room_join", person("Ana"));
    store.reset();
    vi.advanceTimersByTime(NOTIFY.GROUP_WINDOW_MS + NOTIFY.TOAST_TTL_MS + 100);
    expect(store.toasts).toHaveLength(0);
    expect(store.announcement).toBe("");
    expect(eventSound).not.toHaveBeenCalled();
  });
});
