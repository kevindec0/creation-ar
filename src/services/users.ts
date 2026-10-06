import { count, eq, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { users, works, type User } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { slugify } from "../lib/slug.js";

// Hash válido para comparar cuando el correo no existe, así la respuesta tarda lo mismo.
let dummyHash: Promise<string> | undefined;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function countUsers({ db }: AppContext) {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

export async function findByEmail({ db }: AppContext, email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return user;
}

export async function findBySlug({ db }: AppContext, slug: string) {
  const [user] = await db.select().from(users).where(eq(users.slug, slug));
  return user;
}

async function uniqueSlug(ctx: AppContext, base: string, exceptUserId?: number) {
  const root = slugify(base);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const existing = await findBySlug(ctx, candidate);
    if (!existing || existing.id === exceptUserId) return candidate;
  }
  throw new Error("No se pudo generar un identificador público");
}

export async function createUser(
  ctx: AppContext,
  input: { name: string; email: string; password: string; role?: User["role"] },
) {
  const [user] = await ctx.db
    .insert(users)
    .values({
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
      role: input.role ?? "artist",
      slug: await uniqueSlug(ctx, input.name),
    })
    .returning();
  return user!;
}

export async function authenticate(ctx: AppContext, email: string, password: string) {
  const user = await findByEmail(ctx, email);
  if (!user) {
    dummyHash ??= hashPassword("contraseña-de-relleno");
    await verifyPassword(await dummyHash, password);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

export async function updateProfile(
  ctx: AppContext,
  userId: number,
  input: { name: string; bio: string; slug: string },
) {
  const slug = await uniqueSlug(ctx, input.slug || input.name, userId);
  await ctx.db.update(users).set({ name: input.name.trim(), bio: input.bio.trim(), slug }).where(eq(users.id, userId));
  return slug;
}

export async function changePassword(ctx: AppContext, userId: number, password: string) {
  await ctx.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
}

export async function listUsersWithCounts({ db }: AppContext) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      slug: users.slug,
      active: users.active,
      createdAt: users.createdAt,
      works: sql<number>`count(${works.id})::int`,
    })
    .from(users)
    .leftJoin(works, eq(works.userId, users.id))
    .groupBy(users.id)
    .orderBy(users.createdAt);
}

export async function getUser({ db }: AppContext, id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function setActive({ db }: AppContext, id: number, active: boolean) {
  await db.update(users).set({ active }).where(eq(users.id, id));
}

export async function setRole({ db }: AppContext, id: number, role: User["role"]) {
  await db.update(users).set({ role }).where(eq(users.id, id));
}

export async function countAdmins({ db }: AppContext) {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(sql`${users.role} = 'admin' and ${users.active}`);
  return row?.n ?? 0;
}
