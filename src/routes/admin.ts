import { Router } from "express";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { flash, requireAdmin, requireAuth, verifyCsrf } from "../middleware/session.js";
import { destroyUserSessions } from "../services/sessions.js";
import { globalTotals, totalsByWork } from "../services/stats.js";
import { countAdmins, getUser, listUsersWithCounts, setActive, setRole } from "../services/users.js";
import { countWorks, listAllWorks } from "../services/works.js";

export function adminRoutes(ctx: AppContext) {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get("/", async (_req, res) => {
    const [people, workCounts, totals] = await Promise.all([listUsersWithCounts(ctx), countWorks(ctx), globalTotals(ctx)]);
    res.render("admin/index", { title: "Administración", people, workCounts, totals });
  });

  router.get("/works", async (_req, res) => {
    const rows = await listAllWorks(ctx);
    const totals = await totalsByWork(ctx, rows.map((r) => r.work.id));
    res.render("admin/works", { title: "Todas las obras", rows, totals });
  });

  router.post("/users/:id/active", verifyCsrf, async (req, res) => {
    const target = await getUser(ctx, Number(req.params.id));
    if (!target) throw notFound("La cuenta");
    if (target.id === req.user!.id) throw badRequest("No puedes desactivar tu propia cuenta.");
    const active = !target.active;
    if (!active && target.role === "admin" && (await countAdmins(ctx)) <= 1) {
      throw badRequest("Debe quedar al menos una cuenta de administración activa.");
    }
    await setActive(ctx, target.id, active);
    if (!active) await destroyUserSessions(ctx, target.id);
    flash(req, res, "success", active ? `${target.name} puede volver a entrar.` : `${target.name} ya no puede entrar y sus obras dejaron de mostrarse.`);
    res.redirect("/admin");
  });

  router.post("/users/:id/role", verifyCsrf, async (req, res) => {
    const target = await getUser(ctx, Number(req.params.id));
    if (!target) throw notFound("La cuenta");
    const role = req.body.role === "admin" ? "admin" : "artist";
    if (target.id === req.user!.id && role !== "admin") throw badRequest("No puedes quitarte el rol de administración a ti mismo.");
    await setRole(ctx, target.id, role);
    flash(req, res, "success", `${target.name} ahora tiene rol de ${role === "admin" ? "administración" : "artista"}.`);
    res.redirect("/admin");
  });

  return router;
}
