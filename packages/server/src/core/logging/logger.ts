export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

const SECRET_PATTERNS = [
  /session=[^;"\s]+/gi,
  /token["\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi,
  /secret["\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi,
  /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g,
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (m) => `${m.split(/[\s:=]/)[0]}=<redacted>`);
  }
  return out;
}

function formatField(key: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Error) return `err="${redactSecrets(value.message).replaceAll('"', "'")}"`;
  if (typeof value === "number" || typeof value === "boolean") return `${key}=${value}`;
  const s = redactSecrets(String(value)).replaceAll('"', "'");
  return /\s/.test(s) ? `${key}="${s}"` : `${key}=${s}`;
}

function write(level: LogLevel, module: string, event: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const kv = fields
    ? Object.entries(fields)
        .map(([k, v]) => formatField(k, v))
        .filter(Boolean)
        .join(" ")
    : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${module.padEnd(14)} ${event}${kv ? ` ${kv}` : ""}`;
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  return {
    debug: (event, fields) => write("debug", module, event, fields),
    info: (event, fields) => write("info", module, event, fields),
    warn: (event, fields) => write("warn", module, event, fields),
    error: (event, fields) => write("error", module, event, fields),
  };
}
