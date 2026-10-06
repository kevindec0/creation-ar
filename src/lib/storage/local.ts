import { copyFile, mkdir, open, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { keyPattern, type Storage } from "./types.js";

export function localStorage(root: string): Storage {
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Clave de archivo inválida");
    return full;
  };
  return {
    driver: "local",
    directUpload: false,
    origins: { media: [], connect: [] },
    async put(tempPath, key) {
      const dest = resolve(key);
      await mkdir(path.dirname(dest), { recursive: true });
      try {
        await rename(tempPath, dest);
      } catch {
        // rename falla entre discos distintos (por ejemplo, /tmp montado aparte)
        await copyFile(tempPath, dest);
        await unlink(tempPath);
      }
      return key;
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
    url: (key) => `/media/${key}`,
    async readHead(key, bytes) {
      const file = resolve(key);
      const fh = await open(file, "r");
      try {
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(bytes), 0, bytes, 0);
        return { head: buffer.subarray(0, bytesRead), size: (await stat(file)).size };
      } finally {
        await fh.close();
      }
    },
    ownsRef: (key, userId) => keyPattern(userId).test(key),
  };
}
