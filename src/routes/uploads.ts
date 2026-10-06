import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { Router } from "express";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { DECLARED_TYPES, detectBuffer, isUploadKind, readFileHead } from "../lib/files.js";
import { requireAuth, verifyCsrf } from "../middleware/session.js";
import { createUploader } from "../middleware/uploads.js";
import { storageKey } from "../services/works.js";

/**
 * Subida de archivos en dos pasos: primero el archivo llega al almacenamiento
 * (estas rutas) y después el formulario se envía con la referencia del archivo.
 */
export function uploadRoutes(ctx: AppContext) {
  const router = Router();
  router.use(requireAuth);

  // Disco local o S3: el archivo pasa por el servidor.
  const upload = createUploader(ctx.cfg);
  router.post("/", upload.single("file"), verifyCsrf, async (req, res, next) => {
    if (ctx.storage.directUpload) return next(notFound());
    const kind = req.body.kind;
    if (!isUploadKind(kind)) throw badRequest("Tipo de archivo desconocido.");
    if (!req.file) throw badRequest("Selecciona un archivo para subir.");

    const head = await readFileHead(req.file.path);
    const detected = await detectBuffer(head, kind);
    if ("error" in detected) throw badRequest(detected.error);

    const ref = await ctx.storage.put(req.file.path, storageKey(req.user!.id, detected.ext), detected.mime);
    res.status(201).json({ ref, url: ctx.storage.url(ref) });
  });

  // Vercel Blob: el navegador pide permiso aquí y sube el archivo directamente a Blob.
  router.post("/blob", verifyCsrf, async (req, res, next) => {
    if (ctx.storage.driver !== "blob") return next(notFound());
    const userId = req.user!.id;
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      token: ctx.cfg.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let kind: unknown;
        try {
          kind = JSON.parse(clientPayload ?? "{}").kind;
        } catch {
          kind = undefined;
        }
        if (!isUploadKind(kind)) throw new Error("Tipo de archivo desconocido");
        if (!new RegExp(`^u${userId}/[A-Za-z0-9_-]+\\.[a-z0-9]{2,5}$`).test(pathname)) {
          throw new Error("Ruta de archivo no permitida");
        }
        return {
          allowedContentTypes: DECLARED_TYPES[kind],
          maximumSizeInBytes: ctx.cfg.MAX_UPLOAD_MB * 1024 * 1024,
          addRandomSuffix: true,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
    }).catch((err: Error) => {
      throw badRequest(`No se pudo autorizar la subida: ${err.message}`);
    });
    res.json(result);
  });

  return router;
}
