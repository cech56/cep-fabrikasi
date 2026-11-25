// Cep Fabrikası ara sunucusu: telefondan gelen isteği AI'a iletir.
// API anahtarı burada (Cloudflare secret) durur, telefona hiç inmez.
import { buildUserMessage } from "./prompt";
import { Env, ProviderError, generate } from "./providers";
import { checkHtml } from "./safety";

const MAX_PROMPT = 2000;
const MAX_PREVIOUS_HTML = 200_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function overLimit(env: Env, deviceId: string) {
  if (!env.LIMITS) return false;
  const day = new Date().toISOString().slice(0, 10);
  const key = `gen:${day}:${deviceId}`;
  const count = Number((await env.LIMITS.get(key)) ?? 0);
  if (count >= Number(env.DAILY_LIMIT_PER_DEVICE || 20)) return true;
  await env.LIMITS.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, provider: env.AI_PROVIDER });
    if (url.pathname !== "/generate" || request.method !== "POST") return json({ error: "Bulunamadı" }, 404);

    let body: { prompt?: unknown; previousHtml?: unknown; deviceId?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Geçersiz istek" }, 400);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const previousHtml = typeof body.previousHtml === "string" ? body.previousHtml : undefined;
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "anon";
    if (!prompt) return json({ error: "Ne yapmak istediğini yaz" }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: "İstek çok uzun, biraz kısalt" }, 400);
    if (previousHtml && previousHtml.length > MAX_PREVIOUS_HTML) return json({ error: "Uygulama çok büyük" }, 400);

    if (await overLimit(env, deviceId)) return json({ error: "Bugünlük üretim hakkın doldu, yarın görüşürüz." }, 429);

    try {
      const app = await generate(env, buildUserMessage(prompt, previousHtml));
      if (app.refused) return json({ refused: true, reason: app.refusal_reason || "Bu isteği yapamıyorum." });
      const problem = checkHtml(app.html);
      if (problem) return json({ error: `Uygulama güvenlik kontrolünden geçemedi (${problem}). Tekrar dene.` }, 422);
      return json({
        name: app.name.slice(0, 24) || "Yeni uygulama",
        emoji: app.emoji || "✨",
        description: app.description,
        html: app.html,
      });
    } catch (e) {
      if (e instanceof ProviderError) return json({ error: e.message }, e.status);
      if (e instanceof SyntaxError) return json({ error: "AI bozuk bir yanıt verdi, tekrar dene." }, 502);
      return json({ error: "Beklenmeyen bir hata oldu" }, 500);
    }
  },
};
