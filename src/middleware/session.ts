import { timingSafeEqual } from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import type { AppContext } from "../context.js";
import { HttpError, forbidden } from "../lib/errors.js";
import { randomToken } from "../lib/tokens.js";
import { resolveSession } from "../services/sessions.js";

export const SESSION_COOKIE = "car_session";
const CSRF_COOKIE = "car_csrf";
const FLASH_COOKIE = "car_flash";

export const cookieOptions = (req: Request, maxAgeMs?: number): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: req.secure,
  path: "/",
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

/** Carga el usuario de la sesión, el token CSRF y el mensaje flash pendiente. */
export function sessionMiddleware(ctx: AppContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      const found = await resolveSession(ctx, token);
      if (found) {
        req.user = found.user;
        req.sessionToken = token;
        req.csrfToken = found.session.csrfToken;
        if (found.renewedUntil) {
          res.cookie(SESSION_COOKIE, token, cookieOptions(req, found.renewedUntil.getTime() - Date.now()));
        }
      } else {
        res.clearCookie(SESSION_COOKIE, { path: "/" });
      }
    }

    if (!req.csrfToken) {
      // Visitantes sin sesión: token "double submit" guardado en una cookie propia.
      let anon = req.cookies?.[CSRF_COOKIE] as string | undefined;
      if (!anon || anon.length < 20) {
        anon = randomToken();
        res.cookie(CSRF_COOKIE, anon, cookieOptions(req));
      }
      req.csrfToken = anon;
    }

    const rawFlash = req.cookies?.[FLASH_COOKIE] as string | undefined;
    if (rawFlash) {
      try {
        res.locals.flash = JSON.parse(rawFlash);
      } catch {
        /* cookie corrupta: se ignora */
      }
      res.clearCookie(FLASH_COOKIE, { path: "/" });
    }

    res.locals.user = req.user ?? null;
    res.locals.csrfToken = req.csrfToken;
    res.locals.path = req.path;
    next();
  };
}

export function flash(req: Request, res: Response, type: "success" | "error", text: string) {
  res.cookie(FLASH_COOKIE, JSON.stringify({ type, text }), { ...cookieOptions(req, 60_000) });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Debe ir después de los parsers del cuerpo (o de multer en formularios con archivos). */
export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  const sent = (req.get("x-csrf-token") ?? req.body?._csrf) as unknown;
  if (typeof sent !== "string" || !safeEqual(sent, req.csrfToken)) {
    return next(new HttpError(403, "El formulario caducó o no es válido. Recarga la página e inténtalo de nuevo."));
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    if (req.method === "GET") return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    return next(new HttpError(401, "Tu sesión terminó. Vuelve a iniciar sesión."));
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return next(forbidden());
  next();
}
