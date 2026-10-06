import path from "node:path";
import type { Config } from "../../config.js";
import { blobStorage } from "./blob.js";
import { localStorage } from "./local.js";
import { s3Storage } from "./s3.js";
import type { Storage } from "./types.js";

export type { Storage };

export const uploadsDir = (cfg: Config) => path.resolve(cfg.DATA_DIR, "uploads");

export function createStorage(cfg: Config): Storage {
  if (cfg.STORAGE_DRIVER === "blob") return blobStorage(cfg);
  if (cfg.STORAGE_DRIVER === "s3") return s3Storage(cfg);
  return localStorage(uploadsDir(cfg));
}
