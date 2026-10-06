import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { AppContext } from "../context.js";
import { HttpError } from "../lib/errors.js";
import { cleanupUploads } from "./uploads.js";

export function errorHandler(ctx: AppContext) {
  // Express reconoce el manejador de errores por sus 4 parámetros.
  return async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    await cleanupUploads(req);

    let status = 500;
    let message = "Algo falló en el servidor. Inténtalo de nuevo en unos minutos.";
    if (err instanceof HttpError) {
      status = err.status;
      message = err.message;
    } else if (err instanceof multer.MulterError) {
      status = 400;
      message =
        err.code === "LIMIT_FILE_SIZE"
          ? `El archivo supera el máximo de ${ctx.cfg.MAX_UPLOAD_MB} MB.`
          : "No se pudo procesar el archivo enviado.";
    } else {
      ctx.log.error({ err, url: req.originalUrl }, "Error no controlado");
    }

    if (res.headersSent) return;
    const wantsJson =
      req.path.startsWith("/api/") || Boolean(req.is("application/json")) || Boolean(req.get("accept")?.includes("application/json"));
    res.status(status);
    if (wantsJson) return res.json({ error: message });
    res.render("error", { title: status === 404 ? "No encontrado" : "Error", status, message });
  };
}
