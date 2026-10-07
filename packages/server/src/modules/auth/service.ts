import { randomBytes } from "node:crypto";
import type { SessionPayload } from "@share/shared";
import { COOKIES, DISCORD, OAUTH, SESSION } from "../../core/config/constants.js";
import type { AppConfig } from "../../core/config/app.js";
import { createLogger } from "../../core/logging/logger.js";
import { maskedId } from "../../core/logging/pii.js";
import type { Authorizer } from "./authorizers/types.js";
import type { SessionCrypto } from "./crypto.js";
import type { DiscordClient, DiscordUser, TokenData } from "./discord.js";
import type { SessionEvents } from "./session-events.js";
import { SessionRegistry } from "./session-registry.js";
import { identityForSub } from "../streaming/names.js";

const log = createLogger("AuthService");

export interface LoginRedirect {
  location: string;
  stateCookie: string;
}

export type CallbackResult =
  | { ok: true; cookie: string; redirect: string; replacedJti?: string }
  | { ok: false; redirect: string };

export type ValidateResult =
  | { ok: true; session: SessionPayload; newCookie?: string }
  | { ok: false; reason: "expired" | "replaced" };

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

interface AuthServiceDeps {
  crypto: SessionCrypto;
  registry: SessionRegistry;
  events: SessionEvents;
  discord: DiscordClient;
  authorizer: Authorizer;
  sessionMaxDays: number;
  // Revogação LiveKit: o JWT emitido segue válido até o exp mesmo depois da
  // sessão morrer — o kick desconecta o participante de qualquer sala.
  onSessionTerminated?: (sub: string) => void;
}

const DAY_MS = 86_400_000;

function isValidDeeplink(path: string): boolean {
  return (
    path.length <= OAUTH.DEEPLINK_PATH_MAX &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/[\r\n\t]/.test(path)
  );
}

function discordAvatarUrl(user: DiscordUser): string | null {
  return user.avatar ? `${DISCORD.CDN_BASE}/avatars/${user.id}/${user.avatar}.png` : null;
}

function loginFail(config: AppConfig, reason: string): CallbackResult {
  return { ok: false, redirect: `${config.viewerUrl}/login?reason=${reason}` };
}

export class AuthService {
  private readonly refreshDedup = new Map<string, Promise<TokenData | null>>();
  private readonly resyncAt = new Map<string, number>();

  constructor(private readonly deps: AuthServiceDeps) {}

  buildLoginRedirect(config: AppConfig, path?: string): LoginRedirect {
    const target = path !== undefined && isValidDeeplink(path) ? path : "/rooms";
    const nonce = randomBytes(OAUTH.NONCE_BYTES).toString("base64url");
    const stateCookie = this.deps.crypto.signState({ nonce, path: target, iat: Date.now() });
    const params = new URLSearchParams({
      client_id: config.discordClientId,
      redirect_uri: config.discordRedirectUri,
      response_type: "code",
      scope: DISCORD.SCOPES,
      state: nonce,
    });
    return { location: `${DISCORD.OAUTH_AUTHORIZE}?${params}`, stateCookie };
  }

  async handleCallback(
    config: AppConfig,
    query: CallbackQuery,
    stateCookie: string | undefined,
  ): Promise<CallbackResult> {
    if (query.error) return loginFail(config, "oauth_denied");
    if (!query.code || !query.state) return loginFail(config, "oauth_failed");
    if (!stateCookie) return loginFail(config, "invalid_state");
    const state = this.deps.crypto.verifyState(stateCookie, COOKIES.OAUTH_STATE_TTL_SEC);
    if (!state || state.nonce !== query.state) {
      return loginFail(config, "invalid_state");
    }

    let tokens: TokenData;
    let user: DiscordUser;
    try {
      tokens = await this.deps.discord.exchangeCode(config, query.code);
      user = await this.deps.discord.fetchUser(tokens.accessToken);
    } catch (err) {
      log.warn("oauth_failed", { err });
      return loginFail(config, "oauth_failed");
    }

    const authz = await this.deps.authorizer.authorize(user.id);
    if (!authz.ok) {
      if (authz.reason === "unavailable") {
        log.warn("authorizer_unavailable", { sub: maskedId(user.id) });
        return loginFail(config, "unavailable");
      }
      log.info("authorize_denied", { sub: maskedId(user.id) });
      return loginFail(config, "not_authorized");
    }

    // `||` e não `??`: displayName "" não pode virar session name vazio —
    // JWT com name vazio derruba o occupant no toOccupant.
    const name = authz.displayName || user.globalName || user.username;
    const avatarUrl = authz.avatarUrl ?? discordAvatarUrl(user);
    const payload: SessionPayload = {
      sub: user.id,
      name,
      avatarUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      discordExpiresAt: Date.now() + tokens.expiresIn * 1000,
      jti: randomBytes(SESSION.TOKEN_BYTES).toString("base64url"),
      iat: Date.now(),
    };
    const cookie = this.sealWithinLimit(payload);
    if (!cookie) return loginFail(config, "oauth_failed");
    const { replacedJti } = this.deps.registry.register(
      SessionRegistry.key(user.id),
      payload.jti,
    );
    if (replacedJti) {
      this.deps.events.notifyReplaced(replacedJti);
      // A sessão velha morreu — qualquer conexão LiveKit ativa dela cai
      // junto (mesma identity por sub).
      this.deps.onSessionTerminated?.(user.id);
      log.info("session_replaced", { sub: maskedId(user.id) });
    }
    return { ok: true, cookie, redirect: `${config.viewerUrl}${state.path}`, replacedJti };
  }

  async validate(
    rawCookie: string,
    config: AppConfig,
    opts?: { refresh?: boolean },
  ): Promise<ValidateResult> {
    const payload = this.deps.crypto.open(rawCookie);
    if (!payload) return { ok: false, reason: "expired" };

    const key = SessionRegistry.key(payload.sub);
    const check = this.deps.registry.check(key, payload.jti);
    if (check !== "ok") return { ok: false, reason: check };

    if (payload.iat + this.deps.sessionMaxDays * DAY_MS <= Date.now()) {
      this.terminateSession(payload.sub, payload.jti);
      return { ok: false, reason: "expired" };
    }

    let session = payload;
    let newCookie: string | undefined;
    if (opts?.refresh !== false && payload.discordExpiresAt - Date.now() < DISCORD.REFRESH_LEEWAY_MS) {
      const refreshed = await this.refreshSession(config, payload);
      if (!refreshed) {
        this.terminateSession(payload.sub, payload.jti);
        return { ok: false, reason: "expired" };
      }
      session = refreshed;
      newCookie = this.sealWithinLimit(session);
    }

    const resync = await this.resyncProfile(session);
    if (resync === "denied") {
      this.terminateSession(session.sub, session.jti);
      return { ok: false, reason: "expired" };
    }
    if (resync) {
      session = resync;
      newCookie = this.sealWithinLimit(session);
    }

    return { ok: true, session, newCookie };
  }

  /**
   * Segundos de vida restante da sessão — mesma fórmula do cap aplicado
   * em validate(): a sessão morre no mais cedo entre o grant do Discord
   * e o cap absoluto de sessão. TTL do LiveKit nunca ultrapassa isso.
   */
  sessionRemainingSec(payload: SessionPayload): number {
    const expiresAt = Math.min(
      payload.discordExpiresAt,
      payload.iat + this.deps.sessionMaxDays * DAY_MS,
    );
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  }

  private sealWithinLimit(payload: SessionPayload): string | undefined {
    const cookie = this.deps.crypto.seal(payload);
    const bytes = Buffer.byteLength(cookie);
    if (bytes > SESSION.COOKIE_MAX_BYTES) {
      log.warn("session_cookie_oversize", { bytes });
      return undefined;
    }
    return cookie;
  }

  logout(session: SessionPayload): void {
    this.terminateSession(session.sub, session.jti);
  }

  /**
   * A identity LiveKit é derivada do sub — este check é o gate do webhook
   * participant_joined: JWT emitido antes do logout/expiração segue válido
   * até o exp, então o join de uma identity sem sessão viva é kickado.
   */
  isLiveIdentity(identity: string): boolean {
    for (const sub of this.deps.registry.subs()) {
      if (identityForSub(sub) === identity) return true;
    }
    return false;
  }

  private terminateSession(sub: string, jti: string): void {
    this.deps.registry.remove(SessionRegistry.key(sub));
    this.deps.events.closeJti(jti);
    this.resyncAt.delete(jti);
    this.deps.onSessionTerminated?.(sub);
  }

  private refreshSession(
    config: AppConfig,
    payload: SessionPayload,
  ): Promise<SessionPayload | null> {
    let pending = this.refreshDedup.get(payload.jti);
    if (!pending) {
      pending = (async () => {
        try {
          return await this.deps.discord.refresh(config, payload.refreshToken);
        } catch (err) {
          log.warn("discord_refresh_failed", { sub: maskedId(payload.sub), err });
          return null;
        }
      })();
      this.refreshDedup.set(payload.jti, pending);
      void pending.finally(() => this.refreshDedup.delete(payload.jti));
    }
    return pending.then((tokens) => {
      if (!tokens) return null;
      return {
        ...payload,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        discordExpiresAt: Date.now() + tokens.expiresIn * 1000,
      };
    });
  }

  private async resyncProfile(
    payload: SessionPayload,
  ): Promise<SessionPayload | "denied" | null> {
    const last = this.resyncAt.get(payload.jti) ?? 0;
    if (Date.now() - last < SESSION.PROFILE_RESYNC_MS) return null;
    this.resyncAt.set(payload.jti, Date.now());

    const authz = await this.deps.authorizer.authorize(payload.sub);
    if (!authz.ok) return authz.reason === "not_authorized" ? "denied" : null;

    let name = payload.name;
    let avatarUrl = payload.avatarUrl;
    try {
      const user = await this.deps.discord.fetchUser(payload.accessToken);
      name = user.globalName || user.username;
      avatarUrl = discordAvatarUrl(user);
    } catch (err) {
      log.debug("profile_resync_failed", { sub: maskedId(payload.sub), err });
      return null;
    }
    if (name === payload.name && avatarUrl === payload.avatarUrl) return null;
    const updated = { ...payload, name, avatarUrl };
    this.deps.events.send(payload.jti, { type: "profile_updated", name, avatarUrl });
    return updated;
  }
}
