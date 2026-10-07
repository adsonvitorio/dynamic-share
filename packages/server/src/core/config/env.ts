import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

if (process.env.NODE_ENV !== "production") {
  loadDotenv({ path: path.join(ROOT_DIR, ".env") });
}

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const int = z.coerce.number().int().positive();

const envSchema = z
  .object({
    PRODUCTION: bool.default("false"),
    HOST: z.string().min(1),
    PORT: int,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
    VITE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("warn"),

    SESSION_SECRET: z.string().regex(/^[0-9a-f]{64}$/, "SESSION_SECRET deve ser 64 hex chars"),
    SESSION_MAX_DURATION_DAYS: int,
    DATA_DIR: z
      .string()
      .min(1)
      .transform((v) => (path.isAbsolute(v) ? v : path.join(ROOT_DIR, v))),

    DOMAIN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_CLIENT_SECRET: z.string().min(1),
    ALLOWLIST_FILE: z.string().min(1).optional(),
    ROOMS_FILE: z.string().min(1).optional(),
    LIVEKIT_TOKEN_TTL_SEC: int,

    LIVEKIT_URL: z.string().min(1),
    LIVEKIT_API_KEY: z.string().min(1),
    LIVEKIT_API_SECRET: z.string().min(1),
    LIVEKIT_DEV_PORT: int.optional(),
    LIVEKIT_DEV_BIN: z
      .string()
      .optional()
      .transform((v) =>
        v === undefined || v === ""
          ? undefined
          : path.isAbsolute(v)
            ? v
            : path.join(ROOT_DIR, v),
      ),

    ROOM_EMPTY_TIMEOUT_SEC: int,

    DEV_VIEWER_PORT: int.optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.PRODUCTION) {
      for (const key of ["LIVEKIT_DEV_PORT", "DEV_VIEWER_PORT"] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "obrigatória em desenvolvimento" });
        }
      }
    }
  });

export { envSchema };
export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    process.stderr.write(`[config] variáveis de ambiente inválidas ou ausentes:\n${details}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export { ROOT_DIR };
