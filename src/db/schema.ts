import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "artist"]);
export const workStatusEnum = pgEnum("work_status", ["draft", "published"]);
export const assetKindEnum = pgEnum("asset_kind", ["image", "video", "audio", "model", "link"]);
export const assetRoleEnum = pgEnum("asset_role", ["overlay", "extra"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("artist"),
    /** Identificador para el perfil público: /a/:slug */
    slug: text("slug").notNull(),
    bio: text("bio").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_slug_idx").on(t.slug)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 del token de la cookie: si se filtra la base de datos, las sesiones no se pueden reutilizar. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const works = pgTable(
  "works",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    technique: text("technique").notNull().default(""),
    year: integer("year"),
    status: workStatusEnum("status").notNull().default("draft"),
    /** Token aleatorio para el enlace público /v/:token */
    shareToken: text("share_token").notNull(),
    targetImageKey: text("target_image_key").notNull(),
    targetMindKey: text("target_mind_key").notNull(),
    targetWidth: integer("target_width").notNull(),
    targetHeight: integer("target_height").notNull(),
    /** Puntos de reconocimiento que encontró el compilador de MindAR */
    featurePoints: integer("feature_points").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("works_share_token_idx").on(t.shareToken), index("works_user_idx").on(t.userId)],
);

export const assets = pgTable(
  "assets",
  {
    id: serial("id").primaryKey(),
    workId: integer("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    /** overlay: aparece encima de la obra en AR. extra: se muestra en el panel inferior. */
    role: assetRoleEnum("role").notNull().default("extra"),
    title: text("title").notNull().default(""),
    storageKey: text("storage_key"),
    url: text("url"),
    mime: text("mime"),
    size: integer("size"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assets_work_idx").on(t.workId)],
);

export const workStats = pgTable(
  "work_stats",
  {
    workId: integer("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    scans: integer("scans").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workId, t.day] })],
);

export const usersRelations = relations(users, ({ many }) => ({ works: many(works) }));
export const worksRelations = relations(works, ({ one, many }) => ({
  user: one(users, { fields: [works.userId], references: [users.id] }),
  assets: many(assets),
}));
export const assetsRelations = relations(assets, ({ one }) => ({
  work: one(works, { fields: [assets.workId], references: [works.id] }),
}));

export type User = typeof users.$inferSelect;
export type Work = typeof works.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type AssetKind = (typeof assetKindEnum.enumValues)[number];
