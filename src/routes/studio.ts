import { Router, type Request, type Response } from "express";
import type { AppContext } from "../context.js";
import type { AssetKind, Work } from "../db/schema.js";
import { badRequest } from "../lib/errors.js";
import { verifyPassword } from "../lib/passwords.js";
import {
  assetSchema,
  fieldErrors,
  firstError,
  passwordChangeSchema,
  profileSchema,
  targetMetaSchema,
  workInfoSchema,
} from "../lib/validation.js";
import { SESSION_COOKIE, cookieOptions, flash, requireAuth, verifyCsrf } from "../middleware/session.js";
import { createSession, destroyUserSessions } from "../services/sessions.js";
import { dailySeries, totalsByWork } from "../services/stats.js";
import { inspectUpload } from "../services/uploads.js";
import { changePassword, updateProfile } from "../services/users.js";
import {
  addAsset,
  createWork,
  deleteAsset,
  deleteWork,
  getEditableWork,
  listAssets,
  listWorksForUser,
  replaceTarget,
  setStatus,
  updateWorkInfo,
  type TargetInfo,
} from "../services/works.js";
import { publicWorkUrl } from "./public.js";
import { uploadRoutes } from "./uploads.js";

const workId = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("Identificador de obra inválido.");
  return id;
};

export function studioRoutes(ctx: AppContext) {
  const router = Router();
  router.use(requireAuth);
  router.use("/uploads", uploadRoutes(ctx));

  /** Comprueba la imagen de la obra y su archivo .mind, ya subidos al almacenamiento. */
  async function readTarget(req: Request): Promise<TargetInfo> {
    const meta = targetMetaSchema.safeParse(req.body);
    if (!meta.success) throw badRequest("Los datos del análisis no son válidos. Vuelve a elegir la imagen.");
    const userId = req.user!.id;
    const image = await inspectUpload(ctx, userId, req.body.targetImage, "image");
    const mind = await inspectUpload(ctx, userId, req.body.targetMind, "mind");
    return { targetImageKey: image.ref, targetMindKey: mind.ref, ...meta.data };
  }

  router.get("/", async (req, res) => {
    const items = await listWorksForUser(ctx, req.user!.id);
    const totals = await totalsByWork(ctx, items.map((w) => w.id));
    res.render("studio/index", { title: "Mis obras", items, totals });
  });

  router.get("/works/new", (_req, res) => {
    res.render("studio/new", { title: "Nueva obra" });
  });

  // Las rutas que reciben archivos se llaman con fetch y responden JSON.
  router.post("/works", verifyCsrf, async (req, res) => {
    const info = workInfoSchema.safeParse(req.body);
    if (!info.success) return res.status(422).json({ error: firstError(info.error) });
    const target = await readTarget(req);
    const work = await createWork(ctx, req.user!.id, info.data, target);
    flash(req, res, "success", "Obra creada. Ahora añade lo que verá la gente al apuntar la cámara.");
    res.status(201).json({ redirect: `/studio/works/${work.id}` });
  });

  async function renderWork(req: Request, res: Response, work: Work, extra: Record<string, unknown> = {}) {
    const [workAssets, series, totals] = await Promise.all([
      listAssets(ctx, work.id),
      dailySeries(ctx, work.id, 14),
      totalsByWork(ctx, [work.id]),
    ]);
    res.render("studio/work", {
      title: work.title,
      work,
      overlay: workAssets.find((a) => a.role === "overlay"),
      extras: workAssets.filter((a) => a.role === "extra"),
      series,
      totals: totals.get(work.id) ?? { views: 0, scans: 0 },
      shareUrl: publicWorkUrl(ctx, req, work.shareToken),
      values: work,
      errors: {},
      ...extra,
    });
  }

  router.get("/works/:id", async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    await renderWork(req, res, work);
  });

  router.post("/works/:id", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    const parsed = workInfoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422);
      return renderWork(req, res, work, { values: { ...work, ...req.body }, errors: fieldErrors(parsed.error) });
    }
    await updateWorkInfo(ctx, work.id, parsed.data);
    flash(req, res, "success", "Cambios guardados.");
    res.redirect(`/studio/works/${work.id}`);
  });

  router.post("/works/:id/target", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    const target = await readTarget(req);
    await replaceTarget(ctx, work, target);
    flash(req, res, "success", "Imagen de reconocimiento reemplazada.");
    res.json({ redirect: `/studio/works/${work.id}` });
  });

  router.post("/works/:id/assets", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    const parsed = assetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: firstError(parsed.error) });
    const { kind, role, title, url } = parsed.data;

    if (kind === "link") {
      await addAsset(ctx, work.id, { kind, role, title, url });
    } else {
      const file = await inspectUpload(ctx, req.user!.id, req.body.ref, kind as Exclude<AssetKind, "link">);
      await addAsset(ctx, work.id, { kind, role, title, storageKey: file.ref, mime: file.mime, size: file.size ?? undefined });
    }
    flash(req, res, "success", role === "overlay" ? "Contenido sobre la obra actualizado." : "Contenido añadido al panel.");
    res.status(201).json({ redirect: `/studio/works/${work.id}#${role === "overlay" ? "sobre-la-obra" : "panel"}` });
  });

  router.post("/works/:id/assets/:assetId/delete", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    await deleteAsset(ctx, work.id, Number(req.params.assetId));
    flash(req, res, "success", "Contenido eliminado.");
    res.redirect(`/studio/works/${work.id}`);
  });

  router.post("/works/:id/publish", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    await setStatus(ctx, work.id, "published");
    flash(req, res, "success", "Obra publicada. El enlace y el código QR ya funcionan.");
    res.redirect(`/studio/works/${work.id}`);
  });

  router.post("/works/:id/unpublish", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    await setStatus(ctx, work.id, "draft");
    flash(req, res, "success", "La obra volvió a borrador. El enlace dejó de funcionar hasta que la publiques.");
    res.redirect(`/studio/works/${work.id}`);
  });

  router.post("/works/:id/delete", verifyCsrf, async (req, res) => {
    const work = await getEditableWork(ctx, workId(req), req.user!);
    await deleteWork(ctx, work);
    flash(req, res, "success", `“${work.title}” se eliminó junto con sus archivos.`);
    res.redirect(req.user!.role === "admin" && work.userId !== req.user!.id ? "/admin/works" : "/studio");
  });

  // --- Perfil ---
  const renderProfile = (res: Response, extra: Record<string, unknown> = {}) =>
    res.render("studio/profile", { title: "Mi perfil", values: res.locals.user, errors: {}, pwErrors: {}, ...extra });

  router.get("/profile", (_req, res) => renderProfile(res));

  router.post("/profile", verifyCsrf, async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422);
      return renderProfile(res, { values: req.body, errors: fieldErrors(parsed.error) });
    }
    await updateProfile(ctx, req.user!.id, parsed.data);
    flash(req, res, "success", "Perfil actualizado.");
    res.redirect("/studio/profile");
  });

  router.post("/password", verifyCsrf, async (req, res) => {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422);
      return renderProfile(res, { pwErrors: fieldErrors(parsed.error) });
    }
    if (!(await verifyPassword(req.user!.passwordHash, parsed.data.current))) {
      res.status(422);
      return renderProfile(res, { pwErrors: { current: "La contraseña actual no es correcta." } });
    }
    await changePassword(ctx, req.user!.id, parsed.data.password);
    // Cierra las demás sesiones abiertas y crea una nueva para este dispositivo.
    await destroyUserSessions(ctx, req.user!.id);
    const { token, expiresAt } = await createSession(ctx, req.user!.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(req, expiresAt.getTime() - Date.now()));
    flash(req, res, "success", "Contraseña cambiada. Se cerraron las sesiones en otros dispositivos.");
    res.redirect("/studio/profile");
  });

  return router;
}
