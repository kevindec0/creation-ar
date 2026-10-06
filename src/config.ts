import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Vercel define esta variable automáticamente en sus servidores. */
  VERCEL: z.string().optional(),

  /** URL pública de la app (se usa en los códigos QR). Si falta, se deduce de cada petición. */
  APP_URL: z.url().optional(),
  /** Actívalo cuando la app esté detrás de un proxy o túnel. En Vercel se activa solo. */
  TRUST_PROXY: bool.optional(),
  /** Permite que cualquiera cree una cuenta de artista. */
  ALLOW_REGISTRATION: bool.default(true),

  /** Postgres real (Neon, Supabase, Docker…). Si no se define, se usa PGlite embebido en DATA_DIR. */
  DATABASE_URL: z.string().optional(),
  /** Nombre alternativo que usan algunas integraciones de Vercel. */
  POSTGRES_URL: z.string().optional(),
  /** Aplica las migraciones pendientes al arrancar. */
  MIGRATE_ON_START: bool.default(true),
  DATA_DIR: z.string().default("./data"),

  /** local (disco), blob (Vercel Blob) o s3 (R2, B2, MinIO, S3). Por defecto: blob si hay token, si no local. */
  STORAGE_DRIVER: z.enum(["local", "s3", "blob"]).optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** URL pública desde la que se sirven los archivos del bucket (sin barra final). */
  S3_PUBLIC_URL: z.string().optional(),
});

type Parsed = z.infer<typeof schema>;
export type Config = Omit<Parsed, "TRUST_PROXY" | "STORAGE_DRIVER"> & {
  TRUST_PROXY: boolean;
  STORAGE_DRIVER: "local" | "s3" | "blob";
  isVercel: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Las variables vacías ("") cuentan como no definidas.
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(clean);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración inválida en las variables de entorno:\n${issues}`);
  }
  const raw = parsed.data;
  const isVercel = Boolean(raw.VERCEL);
  const cfg: Config = {
    ...raw,
    isVercel,
    DATABASE_URL: raw.DATABASE_URL ?? raw.POSTGRES_URL,
    TRUST_PROXY: raw.TRUST_PROXY ?? isVercel,
    STORAGE_DRIVER: raw.STORAGE_DRIVER ?? (raw.BLOB_READ_WRITE_TOKEN ? "blob" : "local"),
  };

  if (isVercel && !cfg.DATABASE_URL) {
    throw new Error(
      "En Vercel se necesita una base de datos Postgres. Conecta Neon desde la pestaña Storage del proyecto (crea DATABASE_URL) y vuelve a desplegar.",
    );
  }
  if (isVercel && cfg.STORAGE_DRIVER === "local") {
    throw new Error(
      "En Vercel los archivos no pueden guardarse en disco. Crea un Blob store público en la pestaña Storage del proyecto " +
        "y añade la variable BLOB_READ_WRITE_TOKEN (está en los ajustes del store). Después vuelve a desplegar.",
    );
  }
  if (cfg.STORAGE_DRIVER === "blob" && !cfg.BLOB_READ_WRITE_TOKEN) {
    throw new Error("STORAGE_DRIVER=blob requiere BLOB_READ_WRITE_TOKEN.");
  }
  if (cfg.STORAGE_DRIVER === "s3") {
    const missing = (["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const).filter(
      (k) => !cfg[k],
    );
    if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requiere: ${missing.join(", ")}`);
    cfg.S3_PUBLIC_URL = cfg.S3_PUBLIC_URL!.replace(/\/+$/, "");
  }
  return cfg;
}
