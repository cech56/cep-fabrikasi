import { getDeviceId } from "./storage";

// Ara sunucunun adresi. Derlemede EXPO_PUBLIC_API_URL ile verilir (örn. https://cep-fabrikasi.<hesap>.workers.dev)
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export type GenerateResult =
  | { ok: true; name: string; emoji: string; description: string; html: string }
  | { ok: false; message: string };

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
    if (!res.ok || data.error || !data.html) return { ok: false, message: data.error ?? `Sunucu hatası (${res.status})` };
    return { ok: true, name: data.name, emoji: data.emoji, description: data.description ?? "", html: data.html };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, message: "Çok uzun sürdü, tekrar dener misin?" };
    return { ok: false, message: "İnternet bağlantını kontrol et." };
  } finally {
    clearTimeout(timer);
  }
}
