import type { AuthorizeResult } from "@share/shared";
import { allowlistSchema } from "@share/shared";
import { JsonFileSource, JsonSourceError } from "../../../core/config/json-file.js";
import { createLogger } from "../../../core/logging/logger.js";
import { maskedId } from "../../../core/logging/pii.js";
import type { Authorizer } from "./types.js";

const log = createLogger("AllowlistAuthorizer");

export class AllowlistAuthorizer implements Authorizer {
  readonly id = "allowlist";
  private readonly source: JsonFileSource<string[]>;

  constructor(filePath: string) {
    this.source = new JsonFileSource(filePath, allowlistSchema, { label: "allowlist" });
  }

  async authorize(discordId: string): Promise<AuthorizeResult> {
    let allowed: string[];
    try {
      allowed = await this.source.get();
    } catch (err) {
      log.warn("authorize_source_error", {
        sub: maskedId(discordId),
        err: err instanceof JsonSourceError ? err.message : String(err),
      });
      return { ok: false, reason: "not_authorized" };
    }
    if (!allowed.includes(discordId)) return { ok: false, reason: "not_authorized" };
    return { ok: true, displayName: null, avatarUrl: null };
  }
}
