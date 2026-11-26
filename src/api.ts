import { getLang, t } from "./i18n";
import { getDeviceId } from "./storage";
import { MiniApp, Room, SharedApp, VitrinItem } from "./types";

// Ara sunucunun adresi. Derlemede EXPO_PUBLIC_API_URL ile verilir (örn. https://cep-fabrikasi.<hesap>.workers.dev)
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const base = () => API_URL.replace(/\/$/, "");

export type GenerateResult =
  | { ok: true; name: string; emoji: string; description: string; category: string; html: string }
  | { ok: false; message: string; limit?: boolean };

export type ImageInput = { mime: string; data: string };

export async function generateApp(prompt: string, previousHtml?: string, image?: ImageInput): Promise<GenerateResult> {
  if (!API_URL) return { ok: false, message: t("noServer") };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(`${base()}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, previousHtml, image, lang: getLang(), deviceId: await getDeviceId() }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {}
    if (data.refused) return { ok: false, message: data.reason ?? t("cantDo") };
    if (res.status === 429) return { ok: false, message: data.error ?? t("limitHit"), limit: true };
    if (!res.ok || data.error || !data.html) return { ok: false, message: data.error ?? t("serverError", { status: res.status }) };
    return { ok: true, name: data.name, emoji: data.emoji, description: data.description ?? "", category: data.category ?? "diger", html: data.html };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, message: t("tooLong") };
    return { ok: false, message: t("noInternet") };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(path: string, init?: RequestInit): Promise<any> {
  if (!API_URL) throw new Error(t("noServer"));
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, init);
  } catch {
    throw new Error(t("noInternet"));
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.error) throw new Error(data.error ?? t("serverError", { status: res.status }));
  return data;
}

const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (body: unknown) => send("POST", body);
const q = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

// ---- Paylaşma ve vitrin ----

export async function shareApp(app: MiniApp, author: string): Promise<{ id: string; url: string }> {
  return getJson(
    "/api/share",
    post({
      name: app.name,
      emoji: app.emoji,
      description: app.description,
      prompt: app.prompt,
      html: app.html,
      parentId: app.parentId,
      category: app.category ?? "diger",
      author,
      deviceId: await getDeviceId(),
    }),
  );
}

export const shareUrl = (id: string) => `${base()}/a/${id}`;

export async function fetchShared(id: string): Promise<SharedApp> {
  return getJson(`/api/apps/${encodeURIComponent(id)}?view=1`);
}

export type VitrinParams = { sort: "new" | "popular"; offset?: number; category?: string; search?: string };

export async function fetchVitrin(p: VitrinParams): Promise<VitrinItem[]> {
  const data = await getJson(`/api/vitrin?${q({ sort: p.sort, limit: 30, offset: p.offset ?? 0, category: p.category, q: p.search, deviceId: await getDeviceId() })}`);
  return data.items ?? [];
}

export async function fetchFeatured(): Promise<VitrinItem | null> {
  try {
    const data = await getJson(`/api/vitrin/featured?${q({ deviceId: await getDeviceId() })}`);
    return data.item ?? null;
  } catch {
    return null;
  }
}

export async function likeApp(id: string): Promise<{ liked: boolean; likes: number }> {
  return getJson(`/api/apps/${encodeURIComponent(id)}/like`, post({ deviceId: await getDeviceId() }));
}

export async function reportApp(id: string, reason: string): Promise<void> {
  await getJson(`/api/apps/${encodeURIComponent(id)}/report`, post({ reason, deviceId: await getDeviceId() }));
}

export async function fetchUsage(): Promise<{ used: number; limit: number } | null> {
  try {
    return await getJson(`/api/usage?${q({ deviceId: await getDeviceId() })}`);
  } catch {
    return null;
  }
}

// ---- Birlikte kullan (ortak odalar) ----

export const inviteUrl = (roomId: string) => `${base()}/j/${roomId}`;

export async function createRoom(app: MiniApp, data: Record<string, unknown>): Promise<{ id: string; url: string; now: number }> {
  return getJson("/api/rooms", post({ name: app.name, emoji: app.emoji, description: app.description, html: app.html, data, deviceId: await getDeviceId() }));
}

export async function fetchRoom(id: string): Promise<Room> {
  return getJson(`/api/rooms/${encodeURIComponent(id)}`);
}

export async function pushRoomValue(id: string, key: string, value: unknown): Promise<void> {
  await getJson(`/api/rooms/${encodeURIComponent(id)}/data`, post({ key, value, deviceId: await getDeviceId() }));
}

export async function pushRoomHtml(id: string, html: string): Promise<void> {
  await getJson(`/api/rooms/${encodeURIComponent(id)}/html`, send("PUT", { html, deviceId: await getDeviceId() }));
}

export async function fetchRoomChanges(id: string, since: number): Promise<{ now: number; data: Record<string, string>; html?: string }> {
  return getJson(`/api/rooms/${encodeURIComponent(id)}/changes?${q({ since, deviceId: await getDeviceId() })}`);
}

// Odadaki değerler JSON metni olarak saklanır
export function decodeRoomData(data: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    try {
      out[k] = JSON.parse(v);
    } catch {
      out[k] = null;
    }
  }
  return out;
}
