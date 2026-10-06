import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import * as helmetModule from "helmet";
import type { HelmetOptions } from "helmet";
import { pinoHttp } from "pino-http";
import type { AppContext } from "./context.js";
import { notFound } from "./lib/errors.js";
import { QUALITY, qualityLevel } from "./lib/quality.js";
import { uploadsDir } from "./lib/storage/index.js";
import { errorHandler } from "./middleware/errors.js";
import { sessionMiddleware } from "./middleware/session.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { publicRoutes } from "./routes/public.js";
import { studioRoutes } from "./routes/studio.js";
import { countUsers } from "./services/users.js";

// Importación compatible con ESM y con la compilación TypeScript de Vercel,
// que interpreta los tipos de helmet como CommonJS.
type HelmetFn = (options?: Readonly<HelmetOptions>) => express.RequestHandler;
const helmetAny = helmetModule as unknown as { default?: HelmetFn };
const helmet: HelmetFn = helmetAny.default ?? (helmetModule as unknown as HelmetFn);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createApp(ctx: AppContext) {
  const { cfg, storage } = ctx;
  const app = express();

  app.disable("x-powered-by");
  if (cfg.TRUST_PROXY) app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));

  const { media, connect } = storage.origins;
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // A-Frame y MindAR insertan estilos en línea al arrancar la escena.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", ...media],
          mediaSrc: ["'self'", "blob:", ...media],
          connectSrc: ["'self'", "blob:", "data:", ...connect],
          // MindAR crea sus web workers a partir de blobs.
          workerSrc: ["'self'", "blob:", "data:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // La app funciona en http://localhost; en producción Vercel ya fuerza https.
      strictTransportSecurity: cfg.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    next();
  });

  if (cfg.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger: ctx.log,
        autoLogging: { ignore: (req) => /^\/(static|media)\//.test(req.url ?? "") },
        // Registros compactos: método, ruta y estado, sin cabeceras ni cookies.
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ status: res.statusCode }),
        },
      }),
    );
  }

  // En Vercel la CDN sirve public/ directamente y express.static no se usa.
  app.use(express.static(path.join(root, "public"), { maxAge: cfg.NODE_ENV === "production" ? "7d" : 0, index: false }));
  if (cfg.STORAGE_DRIVER === "local") {
    // Los nombres de archivo son aleatorios y nunca cambian: se pueden cachear sin límite.
    app.use("/media", express.static(uploadsDir(cfg), { maxAge: "365d", immutable: true, index: false }));
  }

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(express.json({ limit: "20kb" }));
  app.use(sessionMiddleware(ctx));

  app.locals.media = (key: string | null | undefined) => (key ? storage.url(key) : "");
  app.locals.qualityLevel = qualityLevel;
  app.locals.QUALITY = QUALITY;
  app.locals.allowRegistration = cfg.ALLOW_REGISTRATION;
  app.locals.maxMb = cfg.MAX_UPLOAD_MB;
  app.locals.uploadMode = storage.directUpload ? "blob" : "server";
  app.locals.formatDate = (d: Date) =>
    new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(d);

  // Mientras no exista ninguna cuenta, todo lleva al asistente de configuración inicial.
  let setupDone = false;
  app.use(async (req, res, next) => {
    if (setupDone) return next();
    setupDone = (await countUsers(ctx)) > 0;
    if (setupDone || req.path === "/setup") return next();
    res.redirect("/setup");
  });

  app.use(authRoutes(ctx));
  app.use(publicRoutes(ctx));
  app.use("/studio", studioRoutes(ctx));
  app.use("/admin", adminRoutes(ctx));

  app.use((_req, _res, next) => next(notFound()));
  app.use(errorHandler(ctx));
  return app;
}
