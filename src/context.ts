import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import type { Storage } from "./lib/storage/index.js";

export interface AppContext {
  cfg: Config;
  db: Database;
  storage: Storage;
  log: Logger;
}
