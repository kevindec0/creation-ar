import { and, eq, gt, lt } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { sessions, users } from "../db/schema.js";
import { randomToken, sha256 } from "../lib/tokens.js";

export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export async function createSession({ db }: AppContext, userId: number) {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.insert(sessions).values({ id: sha256(token), userId, csrfToken, expiresAt });
  // Limpieza oportunista de sesiones caducadas
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, csrfToken, expiresAt };
}

export async function resolveSession({ db }: AppContext, token: string) {
  const id = sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || !row.user.active) return null;

  // Renovación deslizante: si quedan menos de la mitad de los días, se extiende.
  let renewedUntil: Date | undefined;
  if (row.session.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
    renewedUntil = new Date(Date.now() + SESSION_DAYS * DAY);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  }
  return { ...row, renewedUntil };
}

export async function destroySession({ db }: AppContext, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function destroyUserSessions({ db }: AppContext, userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
