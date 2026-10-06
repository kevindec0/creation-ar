import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { blobStorage } from "../src/lib/storage/blob.js";

describe("configuración", () => {
  it("en Vercel exige base de datos y almacenamiento externo", () => {
    expect(() => loadConfig({ VERCEL: "1" })).toThrow(/Neon/);
    expect(() => loadConfig({ VERCEL: "1", DATABASE_URL: "postgres://x" })).toThrow(/Blob/);
    const cfg = loadConfig({ VERCEL: "1", DATABASE_URL: "postgres://x", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc_def" });
    expect(cfg.STORAGE_DRIVER).toBe("blob");
    expect(cfg.TRUST_PROXY).toBe(true);
  });

  it("acepta POSTGRES_URL como alternativa", () => {
    expect(loadConfig({ POSTGRES_URL: "postgres://y" }).DATABASE_URL).toBe("postgres://y");
  });

  it("solo acepta URLs de Blob dentro de la carpeta del usuario", () => {
    const storage = blobStorage(loadConfig({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc_def" }));
    const ok = "https://abc123.public.blob.vercel-storage.com/u7/k2j3h4-XyZ12345.jpg";
    expect(storage.ownsRef(ok, 7)).toBe(true);
    expect(storage.ownsRef(ok, 8)).toBe(false);
    expect(storage.ownsRef("https://evil.com/u7/a.jpg", 7)).toBe(false);
    expect(storage.ownsRef("http://abc123.public.blob.vercel-storage.com/u7/a.jpg", 7)).toBe(false);
    expect(storage.ownsRef("https://abc123.public.blob.vercel-storage.com/u7/../u8/a.jpg", 7)).toBe(false);
  });
});
