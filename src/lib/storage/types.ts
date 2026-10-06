export interface StoredHead {
  /** Primeros bytes del archivo, para comprobar su tipo real. */
  head: Buffer;
  size: number | null;
}

/**
 * Una "referencia" (ref) identifica un archivo guardado: en disco y S3 es una clave
 * como `u3/abc.jpg`; en Vercel Blob es la URL completa del archivo.
 */
export interface Storage {
  driver: "local" | "s3" | "blob";
  /** El navegador sube los archivos directamente al almacenamiento (sin pasar por el servidor). */
  directUpload: boolean;
  /** Guarda un archivo temporal del servidor y devuelve su referencia. */
  put(tempPath: string, key: string, contentType: string): Promise<string>;
  delete(ref: string): Promise<void>;
  /** URL con la que el navegador descarga el archivo. */
  url(ref: string): string;
  /** Lee el comienzo del archivo. */
  readHead(ref: string, bytes: number): Promise<StoredHead>;
  /** ¿La referencia está dentro de la carpeta de este usuario? */
  ownsRef(ref: string, userId: number): boolean;
  /** Orígenes externos que la política de seguridad (CSP) debe permitir. */
  origins: { media: string[]; connect: string[] };
}

/** Las claves siempre tienen la forma u<id>/<aleatorio>.<ext> */
export const keyPattern = (userId: number) => new RegExp(`^u${userId}/[A-Za-z0-9_-]+\\.[a-z0-9]{2,5}$`);

/** Lee como máximo `bytes` de una respuesta HTTP y corta la descarga. */
export async function readResponseHead(res: Response, bytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < bytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, bytes);
}

/** Tamaño total a partir de "Content-Range: bytes 0-4099/123456". */
export function sizeFromHeaders(res: Response): number | null {
  const range = res.headers.get("content-range")?.split("/")[1];
  const value = range ?? (res.status === 200 ? res.headers.get("content-length") : null);
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
