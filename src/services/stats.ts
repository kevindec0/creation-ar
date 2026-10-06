import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { workStats } from "../db/schema.js";

export type StatKind = "views" | "scans";

const today = () => new Date().toISOString().slice(0, 10);

export async function recordStat({ db }: AppContext, workId: number, kind: StatKind) {
  await db
    .insert(workStats)
    .values({ workId, day: today(), views: kind === "views" ? 1 : 0, scans: kind === "scans" ? 1 : 0 })
    .onConflictDoUpdate({
      target: [workStats.workId, workStats.day],
      set: kind === "views" ? { views: sql`${workStats.views} + 1` } : { scans: sql`${workStats.scans} + 1` },
    });
}

export async function totalsByWork({ db }: AppContext, workIds: number[]) {
  const result = new Map<number, { views: number; scans: number }>();
  if (!workIds.length) return result;
  const rows = await db
    .select({
      workId: workStats.workId,
      views: sql<number>`sum(${workStats.views})::int`,
      scans: sql<number>`sum(${workStats.scans})::int`,
    })
    .from(workStats)
    .where(inArray(workStats.workId, workIds))
    .groupBy(workStats.workId);
  for (const r of rows) result.set(r.workId, { views: r.views, scans: r.scans });
  return result;
}

/** Serie diaria de los últimos `days` días, con ceros donde no hubo actividad. */
export async function dailySeries({ db }: AppContext, workId: number, days = 14) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const from = start.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(workStats)
    .where(and(eq(workStats.workId, workId), gte(workStats.day, from)));
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    const r = byDay.get(day);
    return { day, views: r?.views ?? 0, scans: r?.scans ?? 0 };
  });
}

export async function globalTotals({ db }: AppContext) {
  const [row] = await db
    .select({
      views: sql<number>`coalesce(sum(${workStats.views}), 0)::int`,
      scans: sql<number>`coalesce(sum(${workStats.scans}), 0)::int`,
    })
    .from(workStats);
  return row ?? { views: 0, scans: 0 };
}
