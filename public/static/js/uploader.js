// Sube un archivo al almacenamiento y devuelve su referencia.
// En Vercel (modo "blob") el archivo va directo del navegador a Vercel Blob;
// en local o S3 (modo "server") pasa por el servidor.

const meta = document.querySelector('meta[name="upload-mode"]');
const csrf = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
export const uploadMode = meta?.content ?? "server";
const userId = meta?.dataset.userId;
export const maxBytes = Number(meta?.dataset.maxMb ?? 50) * 1024 * 1024;

/** Tipo MIME y extensión normalizados, para que coincidan con los que acepta el servidor. */
const BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav",
  glb: "model/gltf-binary", mind: "application/octet-stream",
};
const BY_TYPE = Object.fromEntries(Object.entries(BY_EXT).map(([ext, type]) => [type, ext]));

export function describeFile(file, fallbackExt) {
  const nameExt = (file.name ?? "").split(".").pop()?.toLowerCase();
  const ext = (nameExt && BY_EXT[nameExt] && nameExt) || BY_TYPE[file.type] || fallbackExt || "bin";
  const short = ext === "jpeg" ? "jpg" : ext;
  return { ext: short, contentType: BY_EXT[ext] ?? (file.type || "application/octet-stream") };
}

const randomName = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);

/**
 * @param {Blob|File} file
 * @param {{ kind: string, ext?: string, onProgress?: (pct: number) => void }} opts
 * @returns {Promise<string>} referencia del archivo
 */
export async function uploadFile(file, { kind, ext: forcedExt, onProgress = () => {} }) {
  if (file.size > maxBytes) {
    throw new Error(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es ${maxBytes / 1048576} MB.`);
  }
  const { ext, contentType } = describeFile(file, forcedExt);

  if (uploadMode === "blob") {
    const { upload } = await import("/static/vendor/vercel-blob/client.js");
    const result = await upload(`u${userId}/${randomName()}.${forcedExt ?? ext}`, file, {
      access: "public",
      contentType,
      handleUploadUrl: "/studio/uploads/blob",
      clientPayload: JSON.stringify({ kind }),
      headers: { "X-CSRF-Token": csrf },
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(percentage),
    });
    return result.url;
  }

  // XMLHttpRequest permite mostrar el progreso de la subida (fetch no).
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file, `archivo.${forcedExt ?? ext}`);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/studio/uploads");
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      let json = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.ref) resolve(json.ref);
      else reject(new Error(json.error || "No se pudo subir el archivo."));
    };
    xhr.onerror = () => reject(new Error("Se perdió la conexión mientras se subía el archivo."));
    xhr.send(body);
  });
}

/** Envía JSON a una ruta del estudio y devuelve la respuesta. */
export async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrf },
    credentials: "same-origin",
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "No se pudo guardar. Inténtalo de nuevo.");
  return json;
}
