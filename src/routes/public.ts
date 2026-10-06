import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppContext } from "../context.js";
import { notFound } from "../lib/errors.js";
import { qrPng, qrSvg } from "../lib/qr.js";
import { recordStat } from "../services/stats.js";
import { findBySlug } from "../services/users.js";
import { getPublishedByToken, listPublished } from "../services/works.js";

export const publicWorkUrl = (ctx: AppContext, req: Request, token: string) => {
  const base = ctx.cfg.APP_URL?.replace(/\/+$/, "") ?? `${req.protocol}://${req.get("host")}`;
  return `${base}/v/${token}`;
};

export function publicRoutes(ctx: AppContext) {
  const router = Router();
  const scanLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

  router.get("/", async (_req, res) => {
    const recent = await listPublished(ctx, { limit: 24 });
    res.render("public/home", { title: null, recent });
  });

  router.get("/a/:slug", async (req, res, next) => {
    const artist = await findBySlug(ctx, req.params.slug);
    if (!artist || !artist.active) return next(notFound("El perfil"));
    const items = await listPublished(ctx, { userId: artist.id });
    res.render("public/artist", { title: artist.name, artist, items });
  });

  // Página pública de la obra: funciona sin cámara y enlaza a la experiencia AR.
  router.get("/v/:token", async (req, res) => {
    const data = await getPublishedByToken(ctx, req.params.token);
    await recordStat(ctx, data.work.id, "views");
    res.render("public/work", { title: data.work.title, ...data, shareUrl: publicWorkUrl(ctx, req, data.work.shareToken) });
  });

  router.get("/v/:token/ar", async (req, res) => {
    const data = await getPublishedByToken(ctx, req.params.token);
    // A-Frame genera algunas funciones con `new Function` al cargar (texto 3D), así que esta
    // página, y solo esta, necesita 'unsafe-eval'. No hay contenido de usuarios ejecutable en ella.
    const csp = res.getHeader("Content-Security-Policy");
    if (typeof csp === "string") {
      res.setHeader("Content-Security-Policy", csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"));
    }
    res.render("public/ar", { title: data.work.title, ...data });
  });

  // El archivo de reconocimiento se sirve desde el mismo dominio que la página AR, así MindAR
  // puede descargarlo aunque el almacenamiento externo no envíe cabeceras CORS.
  router.get("/v/:token/target.mind", async (req, res) => {
    const { work } = await getPublishedByToken(ctx, req.params.token);
    const url = ctx.storage.url(work.targetMindKey);
    if (url.startsWith("/")) return res.redirect(url);
    const upstream = await fetch(url);
    if (!upstream.ok) throw notFound("El archivo de reconocimiento");
    res.set("Content-Type", "application/octet-stream");
    // La CDN de Vercel guarda la respuesta un día; el navegador, una hora.
    res.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  });

  router.get("/v/:token/qr.:format", async (req, res, next) => {
    const format = String(req.params.format);
    if (format !== "svg" && format !== "png") return next(notFound());
    const { work } = await getPublishedByToken(ctx, String(req.params.token));
    const url = publicWorkUrl(ctx, req, work.shareToken);
    if (req.query.download !== undefined) {
      res.attachment(`qr-${work.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.${format}`);
    }
    res.set("Cache-Control", "public, max-age=3600");
    if (format === "svg") return res.type("image/svg+xml").send(await qrSvg(url));
    res.type("image/png").send(await qrPng(url));
  });

  // La experiencia AR avisa aquí la primera vez que reconoce la obra.
  router.post("/api/v/:token/scan", scanLimiter, async (req, res) => {
    const { work } = await getPublishedByToken(ctx, String(req.params.token));
    await recordStat(ctx, work.id, "scans");
    res.status(204).end();
  });

  return router;
}
