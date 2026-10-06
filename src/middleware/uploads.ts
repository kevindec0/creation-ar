import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Request } from "express";
import multer from "multer";
import type { Config } from "../config.js";

const tmpDir = path.join(os.tmpdir(), "creation-ar-uploads");

export function createUploader(cfg: Config) {
  mkdirSync(tmpDir, { recursive: true });
  return multer({
    dest: tmpDir,
    limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 },
  });
}

/** Archivos subidos en la petición, como lista. */
export function uploadedFiles(req: Request): Express.Multer.File[] {
  if (!req.files) return req.file ? [req.file] : [];
  return Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
}

/** Borra los temporales que no llegaron a moverse al almacenamiento. */
export async function cleanupUploads(req: Request) {
  await Promise.all(uploadedFiles(req).map((f) => unlink(f.path).catch(() => {})));
}
