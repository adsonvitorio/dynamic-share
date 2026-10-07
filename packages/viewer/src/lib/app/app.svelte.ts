import { appStateSchema } from "@share/shared";
import { API } from "$lib/constants";
import { api } from "$lib/api/client";
import { createLogger } from "$lib/utils/logger";

const log = createLogger("App");

export type AppStatus = "loading" | "ready" | "paused" | "error";

class AppStore {
  status = $state<AppStatus>("loading");

  get isReady(): boolean {
    return this.status === "ready";
  }

  async load(): Promise<void> {
    this.status = "loading";
    const res = await api.get<unknown>(API.STATUS);
    if (!res.ok) {
      this.status = "error";
      log.warn("load_failed", res.error.error);
      return;
    }
    const parsed = appStateSchema.safeParse(res.data);
    if (!parsed.success) {
      this.status = "error";
      log.error("status_invalid", parsed.error.issues[0]?.message);
      return;
    }
    this.status = parsed.data.paused ? "paused" : "ready";
  }
}

export const app = new AppStore();
