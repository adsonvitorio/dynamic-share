import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { SessionPayload } from "@share/shared";

const sessionPayloadSchema = z.object({
  sub: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  accessToken: z.string(),
  refreshToken: z.string(),
  discordExpiresAt: z.number(),
  jti: z.string(),
  iat: z.number(),
});

const oauthStateSchema = z.object({
  nonce: z.string().min(16),
  path: z.string().max(256),
  iat: z.number(),
});

export interface OAuthState {
  nonce: string;
  path: string;
  iat: number;
}

const b64url = (buf: Buffer): string =>
  buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const unb64url = (s: string): Buffer => {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(b64, "base64");
};

export class SessionCrypto {
  private readonly key: Buffer;

  constructor(secretHex: string) {
    this.key = Buffer.from(secretHex, "hex");
    if (this.key.length !== 32) {
      throw new Error("SESSION_SECRET deve ser 64 hex chars (32 bytes)");
    }
  }

  seal(payload: SessionPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${b64url(iv)}.${b64url(ct)}.${b64url(tag)}`;
  }

  open(raw: string): SessionPayload | null {
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    try {
      const [iv, ct, tag] = parts.map(unb64url);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
      const parsed = sessionPayloadSchema.safeParse(JSON.parse(plain));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  signState(state: OAuthState): string {
    const body = b64url(Buffer.from(JSON.stringify(state), "utf8"));
    const sig = createHmac("sha256", this.key).update(body).digest();
    return `${body}.${b64url(sig)}`;
  }

  verifyState(raw: string, maxAgeSec: number, now = Date.now()): OAuthState | null {
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = raw.slice(0, dot);
    const sig = unb64url(raw.slice(dot + 1));
    const expected = createHmac("sha256", this.key).update(body).digest();
    if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
    try {
      const parsed = oauthStateSchema.safeParse(JSON.parse(unb64url(body).toString("utf8")));
      if (!parsed.success) return null;
      if (now - parsed.data.iat > maxAgeSec * 1000 || parsed.data.iat > now + 60_000) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
