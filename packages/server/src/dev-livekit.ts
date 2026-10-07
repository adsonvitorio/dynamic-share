/**
 * Corpo de config YAML para o LiveKit local em dev.
 * O binário `--dev` não emite webhooks por conta própria — sem isto a
 * presença só atualizava via reconcile no /api/token (badge stale até
 * alguém reentrar na sala).
 */
// Scalares entre aspas: `:`/`#`/espaços em credenciais ou URL não
// podem quebrar o parse do YAML.
export function devConfigBody(apiKey: string, apiSecret: string, webhookUrl: string): string {
  return [
    "keys:",
    `  "${apiKey}": "${apiSecret}"`,
    "webhook:",
    `  api_key: "${apiKey}"`,
    "  urls:",
    `    - "${webhookUrl}"`,
  ].join("\n");
}
