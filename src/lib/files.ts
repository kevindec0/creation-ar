import { fileTypeFromBuffer } from "file-type";
import type { AssetKind } from "../db/schema.js";

/** Tipos de archivo que se pueden subir: los de contenido y el archivo .mind de reconocimiento. */
export type UploadKind = Exclude<AssetKind, "link"> | "mind";

/** Tipos permitidos por categoría. Se comprueba el contenido real del archivo, no la extensión. */
export const ALLOWED: Record<Exclude<UploadKind, "mind">, Record<string, string>> = {
  image: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  video: { "video/mp4": "mp4", "video/webm": "webm" },
  audio: { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav" },
  model: { "model/gltf-binary": "glb" },
};

/** Tipos MIME que el navegador puede declarar al subir directamente a Vercel Blob. */
export const DECLARED_TYPES: Record<UploadKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave"],
  model: ["model/gltf-binary", "application/octet-stream"],
  mind: ["application/octet-stream"],
};

export const KIND_LABELS: Record<UploadKind | "link", string> = {
  image: "imagen",
  video: "video",
  audio: "audio",
  model: "modelo 3D",
  link: "enlace",
  mind: "archivo de reconocimiento",
};

const HINTS: Record<Exclude<UploadKind, "mind">, string> = {
  image: "JPG, PNG o WebP",
  video: "MP4 o WebM",
  audio: "MP3, M4A, OGG o WAV",
  model: "GLB (glTF binario)",
};

/** Bytes que hay que leer para reconocer cualquiera de los formatos permitidos. */
export const HEAD_BYTES = 4100;

export const isUploadKind = (v: unknown): v is UploadKind =>
  typeof v === "string" && ["image", "video", "audio", "model", "mind"].includes(v);

export type Detected = { mime: string; ext: string } | { error: string };

/**
 * Identifica un archivo por sus primeros bytes.
 * Los .mind de MindAR son un mapa MessagePack ({ v, dataList }): se comprueba el primer byte.
 */
export async function detectBuffer(head: Buffer, kind: UploadKind): Promise<Detected> {
  if (kind === "mind") {
    const b = head[0];
    const ok = b !== undefined && ((b >= 0x80 && b <= 0x8f) || b === 0xde || b === 0xdf);
    return ok ? { mime: "application/octet-stream", ext: "mind" } : { error: "El archivo de reconocimiento está dañado. Vuelve a elegir la imagen de la obra." };
  }
  const type = await fileTypeFromBuffer(head);
  const ext = type && ALLOWED[kind][type.mime];
  if (!type || !ext) {
    return { error: `El archivo no es un ${KIND_LABELS[kind]} válido. Formatos aceptados: ${HINTS[kind]}.` };
  }
  return { mime: type.mime, ext };
}

/** Lee los primeros bytes de un archivo en disco. */
export async function readFileHead(filePath: string, bytes = HEAD_BYTES): Promise<Buffer> {
  const { open } = await import("node:fs/promises");
  const fh = await open(filePath, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(bytes), 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}
