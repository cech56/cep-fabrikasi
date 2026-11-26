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
  likes: number;
  category: string;
  author: string;
};

export type VitrinItem = Omit<SharedApp, "html" | "prompt" | "parent_id"> & { liked?: number };

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

export async function insertShared(env: Env, a: Omit<SharedApp, "id" | "created_at" | "views" | "remixes" | "likes">, deviceId: string) {
  const id = shortId();
  await env.DB!.prepare(
    `INSERT INTO apps (id, name, emoji, description, prompt, html, device_id, parent_id, created_at, category, author)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(id, a.name, a.emoji, a.description, a.prompt, a.html, deviceId, a.parent_id, Date.now(), a.category, a.author)
    .run();
  if (a.parent_id) await env.DB!.prepare("UPDATE apps SET remixes = remixes + 1 WHERE id = ?1").bind(a.parent_id).run();
  return id;
}

export async function getShared(env: Env, id: string, countView: boolean): Promise<SharedApp | null> {
  const row = await env.DB!.prepare(
    "SELECT id, name, emoji, description, prompt, html, parent_id, created_at, views, remixes, likes, category, author FROM apps WHERE id = ?1 AND hidden = 0",
  )
    .bind(id)
    .first<SharedApp>();
  if (row && countView) await env.DB!.prepare("UPDATE apps SET views = views + 1 WHERE id = ?1").bind(id).run();
  return row ?? null;
}

const LIST_COLS = "id, name, emoji, description, created_at, views, remixes, likes, category, author";

export type VitrinQuery = { sort: "new" | "popular"; limit: number; offset: number; category?: string; q?: string; deviceId?: string };

export async function listVitrin(env: Env, o: VitrinQuery): Promise<VitrinItem[]> {
  const order = o.sort === "popular" ? "(likes * 3 + remixes * 2 + views / 10.0) DESC, created_at DESC" : "created_at DESC";
  const where = ["hidden = 0"];
  const args: unknown[] = [o.deviceId ?? "", o.limit, o.offset];
  if (o.category) {
    args.push(o.category);
    where.push(`category = ?${args.length}`);
  }
  if (o.q) {
    args.push(`%${o.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    where.push(`(name LIKE ?${args.length} ESCAPE '\\' OR description LIKE ?${args.length} ESCAPE '\\')`);
  }
  const { results } = await env.DB!.prepare(
    `SELECT ${LIST_COLS}, EXISTS (SELECT 1 FROM likes l WHERE l.app_id = apps.id AND l.device_id = ?1) AS liked
     FROM apps WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?2 OFFSET ?3`,
  )
    .bind(...args)
    .all<VitrinItem>();
  return results;
}

// Haftanın uygulaması: son 7 günde en çok beğeni alan; yoksa genel olarak en popüler.
export async function featured(env: Env, deviceId: string): Promise<VitrinItem | null> {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const row = await env.DB!.prepare(
    `SELECT ${LIST_COLS}, EXISTS (SELECT 1 FROM likes l2 WHERE l2.app_id = apps.id AND l2.device_id = ?2) AS liked
     FROM apps JOIN (SELECT app_id, COUNT(*) AS c FROM likes WHERE created_at > ?1 GROUP BY app_id) w ON w.app_id = apps.id
     WHERE hidden = 0 ORDER BY w.c DESC, apps.views DESC LIMIT 1`,
  )
    .bind(since, deviceId)
    .first<VitrinItem>();
  if (row) return row;
  const [top] = await listVitrin(env, { sort: "popular", limit: 1, offset: 0, deviceId });
  return top ?? null;
}

export async function toggleLike(env: Env, id: string, deviceId: string): Promise<{ liked: boolean; likes: number }> {
  const del = await env.DB!.prepare("DELETE FROM likes WHERE app_id = ?1 AND device_id = ?2").bind(id, deviceId).run();
  let liked = false;
  if (!del.meta.changes) {
    await env.DB!.prepare("INSERT OR IGNORE INTO likes (app_id, device_id, created_at) VALUES (?1, ?2, ?3)").bind(id, deviceId, Date.now()).run();
    liked = true;
  }
  const row = await env.DB!.prepare("UPDATE apps SET likes = (SELECT COUNT(*) FROM likes WHERE app_id = ?1) WHERE id = ?1 RETURNING likes")
    .bind(id)
    .first<{ likes: number }>();
  return { liked, likes: row?.likes ?? 0 };
}

// ---- Birlikte kullan (odalar) ----

export type Room = { id: string; name: string; emoji: string; description: string; html: string; html_at: number };

const MAX_ROOM_KEYS = 300;

export async function createRoom(env: Env, r: Omit<Room, "id" | "html_at">, deviceId: string, data: Record<string, string>) {
  const id = shortId(10);
  const now = Date.now();
  const stmts = [
    env.DB!.prepare("INSERT INTO rooms (id, name, emoji, description, html, owner, created_at, html_at, html_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?6)").bind(
      id, r.name, r.emoji, r.description, r.html, deviceId, now,
    ),
    ...Object.entries(data)
      .slice(0, MAX_ROOM_KEYS)
      .map(([k, v]) =>
        env.DB!.prepare("INSERT INTO room_data (room_id, key, value, device_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, k, v, deviceId, now),
      ),
  ];
  await env.DB!.batch(stmts);
  return id;
}

export async function getRoom(env: Env, id: string) {
  const room = await env.DB!.prepare("SELECT id, name, emoji, description, html, html_at FROM rooms WHERE id = ?1").bind(id).first<Room>();
  if (!room) return null;
  const { results } = await env.DB!.prepare("SELECT key, value FROM room_data WHERE room_id = ?1").bind(id).all<{ key: string; value: string }>();
  return { ...room, data: Object.fromEntries(results.map((r) => [r.key, r.value])), now: Date.now() };
}

export async function setRoomValue(env: Env, id: string, key: string, value: string, deviceId: string) {
  const now = Date.now();
  const exists = await env.DB!.prepare("SELECT (SELECT COUNT(*) FROM room_data WHERE room_id = ?1) AS n, (SELECT 1 FROM rooms WHERE id = ?1) AS ok").bind(id).first<{
    n: number;
    ok: number | null;
  }>();
  if (!exists?.ok) return { error: "Ortak uygulama bulunamadı" };
  if (exists.n >= MAX_ROOM_KEYS) {
    const has = await env.DB!.prepare("SELECT 1 FROM room_data WHERE room_id = ?1 AND key = ?2").bind(id, key).first();
    if (!has) return { error: "Ortak veri sınırına ulaşıldı" };
  }
  await env.DB!.prepare(
    `INSERT INTO room_data (room_id, key, value, device_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (room_id, key) DO UPDATE SET value = excluded.value, device_id = excluded.device_id, updated_at = excluded.updated_at`,
  )
    .bind(id, key, value, deviceId, now)
    .run();
  return { at: now };
}

export async function setRoomHtml(env: Env, id: string, html: string, deviceId: string) {
  const now = Date.now();
  const res = await env.DB!.prepare("UPDATE rooms SET html = ?2, html_at = ?3, html_by = ?4 WHERE id = ?1").bind(id, html, now, deviceId).run();
  return res.meta.changes ? { at: now } : { error: "Ortak uygulama bulunamadı" };
}

// Verilen zamandan sonra BAŞKALARININ yaptığı değişiklikler (kendi yazdıklarımız geri gelmez).
export async function roomChanges(env: Env, id: string, since: number, deviceId: string) {
  const now = Date.now();
  const { results } = await env.DB!.prepare("SELECT key, value FROM room_data WHERE room_id = ?1 AND updated_at > ?2 AND device_id != ?3")
    .bind(id, since, deviceId)
    .all<{ key: string; value: string }>();
  const room = await env.DB!.prepare("SELECT html, html_at, html_by FROM rooms WHERE id = ?1").bind(id).first<{ html: string; html_at: number; html_by: string }>();
  if (!room) return null;
  return {
    now,
    data: Object.fromEntries(results.map((r) => [r.key, r.value])),
    html: room.html_at > since && room.html_by !== deviceId ? room.html : undefined,
  };
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
