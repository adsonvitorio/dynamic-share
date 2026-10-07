import { spawn } from "node:child_process";
import { loadEnv } from "./core/config/env.js";
import { devConfigBody } from "./dev-livekit.js";

const env = loadEnv();
const bin = env.LIVEKIT_DEV_BIN;
const devPort = env.LIVEKIT_DEV_PORT;

if (!devPort) {
  process.stderr.write("[dev] LIVEKIT_DEV_PORT é obrigatório em dev\n");
  process.exit(1);
}

// Sem binário local, espera-se um LiveKit externo na porta dev (ex.:
// `docker run livekit/livekit-server` — ver README). O server sobe mesmo
// assim; só a mídia falha se nada estiver escutando.
if (bin) {
  const configBody = devConfigBody(
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
    `http://localhost:${env.PORT}/webhook`,
  );

  const livekit = spawn(
    bin,
    ["--dev", "--config-body", configBody, "--bind", "0.0.0.0", "--port", String(devPort)],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  livekit.on("error", (err) => {
    process.stderr.write(`[dev] falha ao iniciar LiveKit local: ${err.message}\n`);
    process.exit(1);
  });

  // LiveKit morto após o spawn (config inválida, porta ocupada) deixaria o
  // dev server rodando sem mídia — falha rápida em vez de erro tardio no
  // /api/token.
  let shuttingDown = false;
  livekit.on("exit", (code) => {
    if (shuttingDown) return;
    process.stderr.write(`[dev] LiveKit local encerrou (code=${code}) — reinicie o dev:server\n`);
    process.exit(1);
  });

  process.on("exit", () => {
    shuttingDown = true;
    livekit.kill();
  });
} else {
  process.stderr.write(`[dev] LIVEKIT_DEV_BIN vazio — assumindo LiveKit externo em :${devPort}\n`);
}

await import("./index.js");
