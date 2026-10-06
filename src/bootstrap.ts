import { pino } from "pino";
import { createApp } from "./create-app.js";
import { loadConfig } from "./config.js";
import { connectDb } from "./db/client.js";
import { createStorage } from "./lib/storage/index.js";

/** Lee la configuración, conecta la base de datos (aplicando migraciones) y arma la app. */
export async function bootstrap() {
  const cfg = loadConfig();
  const log = pino({
    level: cfg.LOG_LEVEL,
    ...(cfg.NODE_ENV === "development" && !cfg.isVercel
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
      : {}),
  });
  const { db, close, driver } = await connectDb(cfg);
  const storage = createStorage(cfg);
  const app = createApp({ cfg, db, storage, log });
  return { app, cfg, log, close, driver };
}
