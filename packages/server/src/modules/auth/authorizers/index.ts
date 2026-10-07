import type { AppConfig } from "../../../core/config/app.js";
import { AllowlistAuthorizer } from "./allowlist.js";
import type { Authorizer } from "./types.js";

export function createAuthorizer(config: AppConfig): Authorizer {
  return new AllowlistAuthorizer(config.allowlistFilePath);
}

export type { Authorizer } from "./types.js";
