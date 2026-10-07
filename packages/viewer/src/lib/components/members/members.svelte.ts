import { createLogger } from "$lib/utils/logger";

const log = createLogger("MembersRail");

const STORAGE_KEY = "share_members_rail_collapsed";

class MembersRailStore {
  collapsed = $state(false);

  constructor() {
    try {
      this.collapsed = globalThis.sessionStorage?.getItem(STORAGE_KEY) === "1";
    } catch {
      this.collapsed = false;
    }
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    try {
      globalThis.sessionStorage?.setItem(STORAGE_KEY, this.collapsed ? "1" : "0");
    } catch (err) {
      log.warn("persist_failed", err);
    }
  }
}

export const membersRailStore = new MembersRailStore();
