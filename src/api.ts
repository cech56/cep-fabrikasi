import { getDeviceId } from "./storage";
import { MiniApp, SharedApp, VitrinItem } from "./types";

// Ara sunucunun adresi. Derlemede EXPO_PUBLIC_API_URL ile verilir (örn. https://cep-fabrikasi.<hesap>.workers.dev)
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export type GenerateResult =
  | { ok: true; name: string; emoji: string; description: string; html: string }
  | { ok: false; message: string; limit?: boolean };

export async function generateApp(prompt: string, previousHtml?: string): Promise<GenerateResult> {
  if (!API_URL) return { ok: false, message: "Sunucu adresi ayarlanmamış (EXPO_PUBLIC_API_URL)." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, previousHtml, deviceId: await getDeviceId() }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {}
    if (data.refused) return { ok: false, message: data.reason ?? "Bu isteği yapamıyorum." };
    if (res.status === 429) return { ok: false, message: data.error ?? "Bugünlük hakkın doldu.", limit: true };
    if (!res.ok || data.error || !data.html) return { ok: false, message: data.error ?? `Sunucu hatası (${res.status})` };
    return { ok: true, name: data.name, emoji: data.emoji, description: data.description ?? "", html: data.html };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, message: "Çok uzun sürdü, tekrar dener misin?" };
    return { ok: false, message: "İnternet bağlantını kontrol et." };
  } finally {
    clearTimeout(timer);
  }
}

const base = () => API_URL.replace(/\/$/, "");

async function getJson(path: string, init?: RequestInit): Promise<any> {
  if (!API_URL) throw new Error("Sunucu adresi ayarlanmamış.");
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, init);
  } catch {
    throw new Error("İnternet bağlantını kontrol et.");
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.error) throw new Error(data.error ?? `Sunucu hatası (${res.status})`);
  return data;
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function shareApp(app: MiniApp): Promise<{ id: string; url: string }> {
  return getJson(
    "/api/share",
    post({ name: app.name, emoji: app.emoji, description: app.description, prompt: app.prompt, html: app.html, parentId: app.parentId, deviceId: await getDeviceId() }),
  );
}

export const shareUrl = (id: string) => `${base()}/a/${id}`;

export async function fetchShared(id: string): Promise<SharedApp> {
  return getJson(`/api/apps/${encodeURIComponent(id)}?view=1`);
}

export async function fetchVitrin(sort: "new" | "popular", offset = 0): Promise<VitrinItem[]> {
  const data = await getJson(`/api/vitrin?sort=${sort}&limit=30&offset=${offset}`);
  return data.items ?? [];
}

export async function reportApp(id: string, reason: string): Promise<void> {
  await getJson(`/api/apps/${encodeURIComponent(id)}/report`, post({ reason, deviceId: await getDeviceId() }));
}

export async function fetchUsage(): Promise<{ used: number; limit: number } | null> {
  try {
    return await getJson(`/api/usage?deviceId=${encodeURIComponent(await getDeviceId())}`);
  } catch {
    return null;
  }
}
