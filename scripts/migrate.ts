/**
 * Aplica las migraciones a la base de datos de DATABASE_URL.
 * Útil para preparar Neon desde tu computador antes del primer despliegue:
 *   DATABASE_URL="postgres://..." npm run db:migrate
 */
import { loadConfig } from "../src/config.js";
import { connectDb } from "../src/db/client.js";

const cfg = loadConfig({ ...process.env, MIGRATE_ON_START: "true" });
if (!cfg.DATABASE_URL) {
  console.error("Define DATABASE_URL (la cadena de conexión de Neon) para ejecutar las migraciones.");
  process.exit(1);
}
const { close } = await connectDb(cfg);
await close();
console.log("Migraciones aplicadas.");
