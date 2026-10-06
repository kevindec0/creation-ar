import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppContext } from "../context.js";
import type { User } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { fieldErrors, loginSchema, registerSchema } from "../lib/validation.js";
import { SESSION_COOKIE, cookieOptions, flash, verifyCsrf } from "../middleware/session.js";
import { createSession, destroySession } from "../services/sessions.js";
import { authenticate, countUsers, createUser, findByEmail } from "../services/users.js";

/** Solo redirige a rutas internas, para que nadie use el login como trampolín a otro sitio. */
const safeNext = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/studio";

export function authRoutes(ctx: AppContext) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: ctx.cfg.NODE_ENV === "test" ? 1000 : 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).render(req.path === "/register" ? "auth/register" : "auth/login", {
        title: "Demasiados intentos",
        values: {},
        errors: { _: "Demasiados intentos seguidos. Espera 15 minutos y vuelve a probar." },
        next: req.body?.next,
      });
    },
  });

  async function startSession(req: Request, res: Response, user: User) {
    const { token, expiresAt } = await createSession(ctx, user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(req, expiresAt.getTime() - Date.now()));
  }

  // --- Configuración inicial: crea la cuenta de administración ---
  router.get("/setup", async (_req, res) => {
    if ((await countUsers(ctx)) > 0) return res.redirect("/login");
    res.render("auth/setup", { title: "Configuración inicial", values: {}, errors: {} });
  });

  router.post("/setup", authLimiter, verifyCsrf, async (req, res) => {
    if ((await countUsers(ctx)) > 0) return res.redirect("/login");
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).render("auth/setup", {
        title: "Configuración inicial",
        values: req.body,
        errors: fieldErrors(parsed.error),
      });
    }
    const user = await createUser(ctx, { ...parsed.data, role: "admin" });
    await startSession(req, res, user);
    flash(req, res, "success", "Cuenta de administración creada. Ya puedes subir tu primera obra.");
    res.redirect("/studio");
  });

  // --- Inicio de sesión ---
  router.get("/login", (req, res) => {
    if (req.user) return res.redirect("/studio");
    res.render("auth/login", { title: "Iniciar sesión", values: {}, errors: {}, next: req.query.next });
  });

  router.post("/login", authLimiter, verifyCsrf, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    const fail = (message: string, status = 401) =>
      res.status(status).render("auth/login", {
        title: "Iniciar sesión",
        values: { email: req.body.email },
        errors: { _: message },
        next: req.body.next,
      });
    if (!parsed.success) return fail("Escribe tu correo y tu contraseña.", 422);

    const user = await authenticate(ctx, parsed.data.email, parsed.data.password);
    if (!user) return fail("El correo o la contraseña no coinciden.");
    if (!user.active) return fail("Esta cuenta está desactivada. Habla con quien administra el sitio.", 403);

    await startSession(req, res, user);
    res.redirect(safeNext(req.body.next));
  });

  router.post("/logout", verifyCsrf, async (req, res) => {
    if (req.sessionToken) await destroySession(ctx, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.redirect("/");
  });

  // --- Registro de artistas ---
  router.get("/register", (req, res, next) => {
    if (!ctx.cfg.ALLOW_REGISTRATION) return next(notFound());
    if (req.user) return res.redirect("/studio");
    res.render("auth/register", { title: "Crear cuenta", values: {}, errors: {} });
  });

  router.post("/register", authLimiter, verifyCsrf, async (req, res, next) => {
    if (!ctx.cfg.ALLOW_REGISTRATION) return next(notFound());
    const parsed = registerSchema.safeParse(req.body);
    const render = (errors: Record<string, string>) =>
      res.status(422).render("auth/register", { title: "Crear cuenta", values: req.body, errors });
    if (!parsed.success) return render(fieldErrors(parsed.error));
    if (await findByEmail(ctx, parsed.data.email)) {
      return render({ email: "Ya existe una cuenta con este correo. Inicia sesión." });
    }
    const user = await createUser(ctx, parsed.data);
    await startSession(req, res, user);
    flash(req, res, "success", "Cuenta creada. Sube tu primera obra.");
    res.redirect("/studio");
  });

  return router;
}
