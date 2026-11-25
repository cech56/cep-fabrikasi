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
