/** Servidor para desarrollo local, Docker o cualquier hosting con servidor propio. */
import { bootstrap } from "./bootstrap.js";

const { app, cfg, log, close, driver } = await bootstrap();

const server = app.listen(cfg.PORT, () => {
  log.info(`CreationAR listo en http://localhost:${cfg.PORT} (base de datos: ${driver}, archivos: ${cfg.STORAGE_DRIVER})`);
});

async function shutdown(signal: string) {
  log.info(`${signal} recibido, cerrando…`);
  server.close();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
