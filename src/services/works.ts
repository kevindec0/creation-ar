import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { assets, users, works, type Asset, type AssetKind, type User, type Work } from "../db/schema.js";
import { forbidden, notFound } from "../lib/errors.js";
import { randomToken } from "../lib/tokens.js";

export interface WorkInfo {
  title: string;
  description: string;
  technique: string;
  year: number | null;
}

export interface TargetInfo {
  targetImageKey: string;
  targetMindKey: string;
  targetWidth: number;
  targetHeight: number;
  featurePoints: number;
}

/** Ruta dentro del almacenamiento. El nombre aleatorio impide adivinar archivos ajenos. */
export const storageKey = (userId: number, ext: string) => `u${userId}/${randomToken(16)}.${ext}`;

export async function createWork(ctx: AppContext, userId: number, info: WorkInfo, target: TargetInfo) {
  const [work] = await ctx.db
    .insert(works)
    .values({ userId, ...info, ...target, shareToken: randomToken(18) })
    .returning();
  return work!;
}

/** Obtiene una obra que el usuario puede editar (dueño o administrador). */
export async function getEditableWork(ctx: AppContext, workId: number, user: User) {
  const [work] = await ctx.db.select().from(works).where(eq(works.id, workId));
  if (!work) throw notFound("La obra");
  if (work.userId !== user.id && user.role !== "admin") throw forbidden();
  return work;
}

export async function listAssets({ db }: AppContext, workId: number) {
  return db.select().from(assets).where(eq(assets.workId, workId)).orderBy(asc(assets.position), asc(assets.id));
}

export async function listWorksForUser({ db }: AppContext, userId: number) {
  return db.select().from(works).where(eq(works.userId, userId)).orderBy(desc(works.updatedAt));
}

export async function listAllWorks({ db }: AppContext) {
  return db
    .select({ work: works, artist: { name: users.name, slug: users.slug } })
    .from(works)
    .innerJoin(users, eq(users.id, works.userId))
    .orderBy(desc(works.createdAt));
}

export async function listPublished({ db }: AppContext, opts: { userId?: number; limit?: number } = {}) {
  const conditions = [eq(works.status, "published"), eq(users.active, true)];
  if (opts.userId) conditions.push(eq(works.userId, opts.userId));
  return db
    .select({ work: works, artist: { name: users.name, slug: users.slug } })
    .from(works)
    .innerJoin(users, eq(users.id, works.userId))
    .where(and(...conditions))
    .orderBy(desc(works.createdAt))
    .limit(opts.limit ?? 60);
}

export async function getPublishedByToken(ctx: AppContext, token: string) {
  const [row] = await ctx.db
    .select({ work: works, artist: { id: users.id, name: users.name, slug: users.slug, bio: users.bio } })
    .from(works)
    .innerJoin(users, eq(users.id, works.userId))
    .where(and(eq(works.shareToken, token), eq(works.status, "published"), eq(users.active, true)));
  if (!row) throw notFound("La obra");
  return { ...row, assets: await listAssets(ctx, row.work.id) };
}

export async function updateWorkInfo({ db }: AppContext, workId: number, info: WorkInfo) {
  await db.update(works).set({ ...info, updatedAt: new Date() }).where(eq(works.id, workId));
}

export async function replaceTarget(ctx: AppContext, work: Work, target: TargetInfo) {
  await ctx.db.update(works).set({ ...target, updatedAt: new Date() }).where(eq(works.id, work.id));
  await safeDelete(ctx, [work.targetImageKey, work.targetMindKey]);
}

export async function setStatus({ db }: AppContext, workId: number, status: Work["status"]) {
  await db.update(works).set({ status, updatedAt: new Date() }).where(eq(works.id, workId));
}

export async function deleteWork(ctx: AppContext, work: Work) {
  const workAssets = await listAssets(ctx, work.id);
  await ctx.db.delete(works).where(eq(works.id, work.id));
  await safeDelete(ctx, [work.targetImageKey, work.targetMindKey, ...workAssets.map((a) => a.storageKey)]);
}

export async function addAsset(
  ctx: AppContext,
  workId: number,
  input: { kind: AssetKind; role: Asset["role"]; title: string; storageKey?: string; url?: string; mime?: string; size?: number },
) {
  // Solo puede haber un contenido superpuesto: el nuevo reemplaza al anterior.
  if (input.role === "overlay") {
    const previous = await ctx.db
      .delete(assets)
      .where(and(eq(assets.workId, workId), eq(assets.role, "overlay")))
      .returning();
    await safeDelete(ctx, previous.map((a) => a.storageKey));
  }
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: count() }).from(assets).where(eq(assets.workId, workId));
  const [asset] = await ctx.db
    .insert(assets)
    .values({ workId, ...input, position: n })
    .returning();
  await ctx.db.update(works).set({ updatedAt: new Date() }).where(eq(works.id, workId));
  return asset!;
}

export async function deleteAsset(ctx: AppContext, workId: number, assetId: number) {
  const [asset] = await ctx.db
    .delete(assets)
    .where(and(eq(assets.id, assetId), eq(assets.workId, workId)))
    .returning();
  if (!asset) throw notFound("El contenido");
  await safeDelete(ctx, [asset.storageKey]);
}

export async function countWorks({ db }: AppContext) {
  const [row] = await db
    .select({ total: count(), published: sql<number>`count(*) filter (where ${works.status} = 'published')::int` })
    .from(works);
  return row ?? { total: 0, published: 0 };
}

async function safeDelete(ctx: AppContext, keys: (string | null | undefined)[]) {
  for (const key of keys) {
    if (!key) continue;
    try {
      await ctx.storage.delete(key);
    } catch (err) {
      ctx.log.warn({ err, key }, "No se pudo borrar un archivo del almacenamiento");
    }
  }
}
