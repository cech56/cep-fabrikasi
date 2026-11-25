import Anthropic from "@anthropic-ai/sdk";
import { GeneratedApp, OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt";

export type Env = {
  AI_PROVIDER: string;
  GEMINI_MODEL: string;
  GEMINI_THINKING?: string;
  ANTHROPIC_MODEL: string;
  DAILY_LIMIT_PER_DEVICE: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  LIMITS?: KVNamespace;
};

export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// Gemini'nin responseSchema'sı additionalProperties desteklemez; onu çıkarıyoruz.
const { additionalProperties: _ignored, ...geminiSchema } = OUTPUT_SCHEMA;

async function generateWithGemini(env: Env, userMessage: string): Promise<GeneratedApp> {
  if (!env.GEMINI_API_KEY) throw new ProviderError("GEMINI_API_KEY eksik", 500);
  // Akışlı uç nokta: uzun üretimlerde bağlantı boşta kalıp zaman aşımına düşmesin.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const call = () => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema,
        maxOutputTokens: 32000,
        // Düşünme seviyesi düşük = çok daha hızlı üretim. Boş bırakılırsa modelin varsayılanı kullanılır.
        ...(env.GEMINI_THINKING ? { thinkingConfig: { thinkingLevel: env.GEMINI_THINKING } } : {}),
      },
    }),
  });
  // Ücretsiz katmanda "yoğunluk" (503/500) geçicidir: kısa beklemelerle 3 kez dene.
  let res = await call();
  for (const wait of [2000, 6000]) {
    if (res.status !== 503 && res.status !== 500) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await call();
  }
  if (res.status === 503) throw new ProviderError("Google şu an çok yoğun, birkaç dakika sonra tekrar dene.", 503);
  if (res.status === 429) throw new ProviderError("Günlük ücretsiz kota doldu, biraz sonra tekrar dene.", 429);
  if (!res.ok || !res.body) throw new ProviderError(`Gemini hatası ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  let finishReason = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const chunk: any = JSON.parse(line.slice(5));
        const cand = chunk?.candidates?.[0];
        for (const part of cand?.content?.parts ?? []) if (!part.thought && part.text) text += part.text;
        if (cand?.finishReason) finishReason = cand.finishReason;
      } catch {
        // yarım satır olmaz (satır satır işliyoruz); bozuk parça atlanır
      }
    }
    if (done) break;
  }
  if (finishReason === "MAX_TOKENS") throw new ProviderError("Uygulama çok uzun oldu, daha sade anlatmayı dene.", 422);
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    return { name: "", emoji: "", description: "", html: "", refused: true, refusal_reason: "Bu isteği yapamıyorum, başka bir şey dener misin?" };
  }
  if (!text) throw new ProviderError("Gemini boş yanıt döndü");
  return JSON.parse(text) as GeneratedApp;
}

async function generateWithAnthropic(env: Env, userMessage: string): Promise<GeneratedApp> {
  if (!env.ANTHROPIC_API_KEY) throw new ProviderError("ANTHROPIC_API_KEY eksik", 500);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const message = await client.beta.messages
      .stream({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      })
      .finalMessage();
    if (message.stop_reason === "refusal") {
      return { name: "", emoji: "", description: "", html: "", refused: true, refusal_reason: "Bu isteği yapamıyorum, başka bir şey dener misin?" };
    }
    if (message.stop_reason === "max_tokens") throw new ProviderError("Uygulama çok uzun oldu, daha sade anlatmayı dene.", 422);
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return JSON.parse(text) as GeneratedApp;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError("Çok yoğunuz, biraz sonra tekrar dene.", 429);
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError("ANTHROPIC_API_KEY geçersiz", 500);
    if (e instanceof Anthropic.APIError) throw new ProviderError(`Anthropic hatası ${e.status}`);
    throw e;
  }
}

export function generate(env: Env, userMessage: string) {
  return env.AI_PROVIDER === "anthropic" ? generateWithAnthropic(env, userMessage) : generateWithGemini(env, userMessage);
}
