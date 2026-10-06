import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { del, put } from "@vercel/blob";
import type { Config } from "../../config.js";
import { readResponseHead, sizeFromHeaders, type Storage } from "./types.js";

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

/**
 * Vercel Blob. Los archivos se suben directamente desde el navegador (así se evita el límite
 * de 4,5 MB por petición de las funciones de Vercel) y se guardan con su URL pública.
 */
export function blobStorage(cfg: Config): Storage {
  const token = cfg.BLOB_READ_WRITE_TOKEN!;
  return {
    driver: "blob",
    directUpload: true,
    origins: {
      media: ["https://*.public.blob.vercel-storage.com"],
      // El cliente de subida habla con la API de Vercel Blob.
      connect: ["https://*.public.blob.vercel-storage.com", "https://vercel.com", "https://*.blob.vercel-storage.com"],
    },
    async put(tempPath, key, contentType) {
      const result = await put(key, createReadStream(tempPath), {
        access: "public",
        contentType,
        addRandomSuffix: true,
        token,
      });
      await unlink(tempPath).catch(() => {});
      return result.url;
    },
    async delete(url) {
      await del(url, { token });
    },
    url: (ref) => ref,
    async readHead(url, bytes) {
      const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
      if (!res.ok) throw new Error(`No se pudo leer el archivo (${res.status})`);
      return { head: await readResponseHead(res, bytes), size: sizeFromHeaders(res) };
    },
    ownsRef(ref, userId) {
      try {
        const u = new URL(ref);
        return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && new RegExp(`^/u${userId}/[A-Za-z0-9_.-]+$`).test(u.pathname);
      } catch {
        return false;
      }
    },
  };
}
