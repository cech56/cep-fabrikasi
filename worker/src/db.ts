import { Env } from "./providers";

export type SharedApp = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  html: string;
  parent_id: string | null;
  created_at: number;
  views: number;
  remixes: number;
};

export type VitrinItem = Omit<SharedApp, "html" | "prompt" | "parent_id">;

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export function shortId(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// Günlük üretim limiti. Limit aşılmadıysa sayacı artırır ve false döner.
export async function overDailyLimit(env: Env, deviceId: string): Promise<boolean> {
  if (!env.DB) return false;
  const limit = Number(env.DAILY_LIMIT_PER_DEVICE || 20);
  const row = await env.DB.prepare(
    `INSERT INTO usage (device_id, day, count) VALUES (?1, ?2, 1)
     ON CONFLICT (device_id, day) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(deviceId, today())
    .first<{ count: number }>();
  return (row?.count ?? 0) > limit;
}

export async function usageToday(env: Env, deviceId: string) {
  if (!env.DB) return { used: 0, limit: Number(env.DAILY_LIMIT_PER_DEVICE || 20) };
  const row = await env.DB.prepare("SELECT count FROM usage WHERE device_id = ?1 AND day = ?2").bind(deviceId, today()).first<{ count: number }>();
  return { used: row?.count ?? 0, limit: Number(env.DAILY_LIMIT_PER_DEVICE || 20) };
}

export async function insertShared(env: Env, a: Omit<SharedApp, "id" | "created_at" | "views" | "remixes">, deviceId: string) {
  const id = shortId();
  await env.DB!.prepare(
    `INSERT INTO apps (id, name, emoji, description, prompt, html, device_id, parent_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(id, a.name, a.emoji, a.description, a.prompt, a.html, deviceId, a.parent_id, Date.now())
    .run();
  if (a.parent_id) await env.DB!.prepare("UPDATE apps SET remixes = remixes + 1 WHERE id = ?1").bind(a.parent_id).run();
  return id;
}

export async function getShared(env: Env, id: string, countView: boolean): Promise<SharedApp | null> {
  const row = await env.DB!.prepare(
    "SELECT id, name, emoji, description, prompt, html, parent_id, created_at, views, remixes FROM apps WHERE id = ?1 AND hidden = 0",
  )
    .bind(id)
    .first<SharedApp>();
  if (row && countView) await env.DB!.prepare("UPDATE apps SET views = views + 1 WHERE id = ?1").bind(id).run();
  return row ?? null;
}

export async function listVitrin(env: Env, sort: "new" | "popular", limit: number, offset: number): Promise<VitrinItem[]> {
  const order = sort === "popular" ? "remixes DESC, views DESC, created_at DESC" : "created_at DESC";
  const { results } = await env.DB!.prepare(
    `SELECT id, name, emoji, description, created_at, views, remixes FROM apps WHERE hidden = 0 ORDER BY ${order} LIMIT ?1 OFFSET ?2`,
  )
    .bind(limit, offset)
    .all<VitrinItem>();
  return results;
}

// Aynı cihaz bir uygulamayı bir kez şikayet edebilir; eşik aşılınca uygulama gizlenir.
export async function reportShared(env: Env, id: string, deviceId: string, reason: string) {
  const res = await env.DB!.prepare("INSERT OR IGNORE INTO reports (app_id, device_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, deviceId, reason.slice(0, 300), Date.now())
    .run();
  if (!res.meta.changes) return;
  const threshold = Number(env.REPORTS_TO_HIDE || 3);
  await env.DB!.prepare("UPDATE apps SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ?2 THEN 1 ELSE hidden END WHERE id = ?1")
    .bind(id, threshold)
    .run();
}
