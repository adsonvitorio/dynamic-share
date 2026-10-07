import type { AuthorizeResult } from "@share/shared";

export interface Authorizer {
  readonly id: string;
  authorize(discordId: string): Promise<AuthorizeResult>;
}
