import type { RoomConfig } from "@share/shared";
import { roomsConfigSchema } from "@share/shared";
import { JsonFileSource } from "../../core/config/json-file.js";
import { errors } from "../../core/http/errors.js";
import type { AppConfig } from "../../core/config/app.js";

export class RoomsService {
  private readonly source: JsonFileSource<RoomConfig[]>;

  constructor(config: AppConfig) {
    this.source = new JsonFileSource(config.roomsFilePath, roomsConfigSchema, {
      label: "rooms",
    });
  }

  async list(): Promise<RoomConfig[]> {
    try {
      return await this.source.get();
    } catch {
      throw errors.unavailable("Não foi possível carregar as salas agora.");
    }
  }

  async get(name: string): Promise<RoomConfig> {
    const rooms = await this.list();
    const room = rooms.find((r) => r.name === name);
    if (!room) throw errors.roomNotFound();
    return room;
  }
}
