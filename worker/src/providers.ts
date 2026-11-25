import Anthropic from "@anthropic-ai/sdk";
import { GeneratedApp, OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt";

export type Env = {
  AI_PROVIDER: string;
  GEMINI_MODEL: string;
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema,
        maxOutputTokens: 32000,
      },
    }),
  });
  if (res.status === 429) throw new ProviderError("Günlük ücretsiz kota doldu, biraz sonra tekrar dene.", 429);
  if (!res.ok) throw new ProviderError(`Gemini hatası ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data: any = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("");
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
