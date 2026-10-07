import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { appStateSchema } from "@share/shared";
import { JsonFileSource, JsonSourceError } from "../../core/config/json-file.js";
import type { AppConfig } from "../../core/config/app.js";
import { createLogger } from "../../core/logging/logger.js";
import path from "node:path";

const log = createLogger("App");

export interface AppPluginOptions {
  config: AppConfig;
  stateDir: string;
}

export class AppState {
  private readonly source: JsonFileSource<{ paused: boolean }>;

  constructor(stateDir: string) {
    this.source = new JsonFileSource(
      path.join(stateDir, "state.json"),
      appStateSchema,
      { label: "app-state" },
    );
  }

  async isPaused(): Promise<boolean> {
    try {
      return (await this.source.get()).paused;
    } catch (err) {
      if (err instanceof JsonSourceError) return false;
      log.warn("state_read_failed", { err });
      return false;
    }
  }
}

async function appPlugin(app: FastifyInstance, opts: AppPluginOptions): Promise<void> {
  app.decorate("appConfig", opts.config);
  app.decorate("appState", new AppState(opts.stateDir));
}

declare module "fastify" {
  interface FastifyInstance {
    appConfig: AppConfig;
    appState: AppState;
  }
}

export default fp(appPlugin, { name: "app" });
