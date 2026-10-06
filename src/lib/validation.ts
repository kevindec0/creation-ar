import { z } from "zod";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

export const emailField = z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido."));
export const passwordField = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(200, "La contraseña es demasiado larga.");
export const nameField = text(80).min(2, "Escribe tu nombre (mínimo 2 caracteres).");

export const registerSchema = z
  .object({ name: nameField, email: emailField, password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export const loginSchema = z.object({ email: emailField, password: z.string().min(1, "Escribe tu contraseña.") });

export const workInfoSchema = z.object({
  title: text(120).min(1, "La obra necesita un título."),
  description: text(4000).default(""),
  technique: text(120).default(""),
  year: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1000 || n > new Date().getFullYear() + 1) {
        ctx.addIssue({ code: "custom", message: "El año no es válido." });
        return z.NEVER;
      }
      return n;
    }),
});

export const targetMetaSchema = z.object({
  targetWidth: z.coerce.number().int().min(100).max(4096),
  targetHeight: z.coerce.number().int().min(100).max(4096),
  featurePoints: z.coerce.number().int().min(0).max(1_000_000),
});

export const profileSchema = z.object({
  name: nameField,
  bio: text(1000).default(""),
  slug: text(40).default(""),
});

export const passwordChangeSchema = z
  .object({ current: z.string().min(1, "Escribe tu contraseña actual."), password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export const assetSchema = z
  .object({
    role: z.enum(["overlay", "extra"]),
    kind: z.enum(["image", "video", "audio", "model", "link"]),
    title: text(120).default(""),
    url: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "overlay" && !["image", "video", "model"].includes(v.kind)) {
      ctx.addIssue({ code: "custom", message: "Sobre la obra solo se puede mostrar una imagen, un video o un modelo 3D." });
    }
    if (v.role === "extra" && v.kind === "model") {
      ctx.addIssue({ code: "custom", message: "Los modelos 3D se muestran sobre la obra, no en el panel." });
    }
    if (v.kind === "link") {
      const ok = z.url({ protocol: /^https?$/ }).safeParse(v.url).success;
      if (!ok) ctx.addIssue({ code: "custom", message: "Escribe un enlace completo, que empiece por https://" });
      if (!v.title) ctx.addIssue({ code: "custom", message: "Ponle un texto al enlace para que la gente sepa a dónde lleva." });
    }
  });

/** Primer mensaje de error, listo para mostrar en el formulario. */
export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisa los datos del formulario.";
}

/** Errores agrupados por campo. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
