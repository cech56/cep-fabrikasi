import { parse } from "acorn";

// Üretilen HTML için basit statik kontrol. Asıl koruma uygulamadaki kapalı kutu (CSP + gezinme engeli);
// bu kontrol bariz ihlalleri baştan reddeder.
const FORBIDDEN: [RegExp, string][] = [
  [/<script[^>]+src\s*=/i, "harici script"],
  [/<link[^>]+href\s*=\s*["']?https?:/i, "harici stil"],
  [/\bfetch\s*\(/, "ağ isteği"],
  [/XMLHttpRequest/, "ağ isteği"],
  [/new\s+WebSocket/, "ağ isteği"],
  [/navigator\.sendBeacon/, "ağ isteği"],
  [/<iframe/i, "iframe"],
  [/\beval\s*\(/, "eval"],
];

export function checkHtml(html: string): string | null {
  if (!/^\s*<!doctype html>/i.test(html)) return "geçersiz belge";
  for (const [re, label] of FORBIDDEN) if (re.test(html)) return label;
  return null;
}

// Satır içi scriptleri sözdizimi açısından kontrol eder; ilk hatayı (satır bilgisiyle) döndürür.
export function syntaxError(html: string): string | null {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/type\s*=\s*["']?(?!text\/javascript|module|application\/javascript)/i.test(attrs)) continue; // JSON vb.
    try {
      parse(m[2], { ecmaVersion: "latest", sourceType: /type\s*=\s*["']?module/i.test(attrs) ? "module" : "script" });
    } catch (e: any) {
      return String(e?.message ?? e).slice(0, 200);
    }
  }
  return null;
}
