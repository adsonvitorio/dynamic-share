type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const minLevel: LogLevel =
  (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ?? "warn";

const SECRET_PATTERNS = [
  /(token|secret|session|cookie)["\s:=]+\S{8,}/gi,
  /authorization["\s:=]+\S+(\s+\S+)*/gi,
];

function redact(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let out = value;
  for (const p of SECRET_PATTERNS) out = out.replace(p, "<redacted>");
  return out;
}

export interface Logger {
  debug(event: string, ...args: unknown[]): void;
  info(event: string, ...args: unknown[]): void;
  warn(event: string, ...args: unknown[]): void;
  error(event: string, ...args: unknown[]): void;
}

export function createLogger(module: string): Logger {
  const emit = (level: LogLevel, event: string, args: unknown[]) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    fn(`[${module}] ${event}`, ...args.map(redact));
  };
  return {
    debug: (e, ...a) => emit("debug", e, a),
    info: (e, ...a) => emit("info", e, a),
    warn: (e, ...a) => emit("warn", e, a),
    error: (e, ...a) => emit("error", e, a),
  };
}
