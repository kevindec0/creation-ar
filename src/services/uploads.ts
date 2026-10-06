import type { AppContext } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { detectBuffer, HEAD_BYTES, type UploadKind } from "../lib/files.js";

export interface InspectedUpload {
  ref: string;
  mime: string;
  size: number | null;
}

/**
 * Comprueba un archivo ya subido antes de asociarlo a una obra:
 * que esté en la carpeta del usuario y que su contenido sea del tipo esperado.
 * Si no lo es, lo borra para no dejar basura en el almacenamiento.
 */
export async function inspectUpload(ctx: AppContext, userId: number, ref: unknown, kind: UploadKind): Promise<InspectedUpload> {
  if (typeof ref !== "string" || !ctx.storage.ownsRef(ref, userId)) {
    throw badRequest("El archivo subido no es válido. Vuelve a seleccionarlo.");
  }
  let head: Buffer;
  let size: number | null;
  try {
    ({ head, size } = await ctx.storage.readHead(ref, HEAD_BYTES));
  } catch (err) {
    ctx.log.warn({ err, ref }, "No se pudo leer un archivo subido");
    throw badRequest("No encontramos el archivo subido. Vuelve a intentarlo.");
  }
  const detected = await detectBuffer(head, kind);
  if ("error" in detected) {
    await ctx.storage.delete(ref).catch(() => {});
    throw badRequest(detected.error);
  }
  if (size && size > ctx.cfg.MAX_UPLOAD_MB * 1024 * 1024) {
    await ctx.storage.delete(ref).catch(() => {});
    throw badRequest(`El archivo supera el máximo de ${ctx.cfg.MAX_UPLOAD_MB} MB.`);
  }
  return { ref, mime: detected.mime, size };
}
