import { getDeviceId } from "./storage";
import { Box, Character, WalkStyle } from "./types";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type Analysis = Pick<Character, "name" | "kind" | "emoji" | "greeting" | "lines" | "pitch" | "walkStyle" | "parts">;

const STYLES: WalkStyle[] = ["walk", "hop", "fly", "swim", "slither", "roll"];

// Gemini kutuları: [ymin, xmin, ymax, xmax], 0..1000
function toBox(b: unknown): Box | null {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === "number")) return null;
  const [y0, x0, y1, x1] = b.map((v) => Math.max(0, Math.min(1000, v)) / 1000);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const boxes = (a: unknown) => (Array.isArray(a) ? a.map(toBox).filter((b): b is Box => !!b) : []);

export async function analyzeDrawing(jpegDataUrl: string): Promise<Analysis | null> {
  if (!API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: jpegDataUrl.slice(jpegDataUrl.indexOf(",") + 1), deviceId: await getDeviceId() }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    if (!d || d.error || typeof d.name !== "string") return null;
    const lines = Array.isArray(d.lines) ? d.lines.filter((l: unknown) => typeof l === "string" && l.length < 120).slice(0, 8) : [];
    return {
      name: d.name.slice(0, 24),
      kind: String(d.kind ?? "").slice(0, 30),
      emoji: String(d.emoji ?? "✨").slice(0, 4),
      greeting: String(d.greeting ?? "").slice(0, 120),
      lines,
      pitch: Math.max(0.6, Math.min(1.8, Number(d.voicePitch) || 1.2)),
      walkStyle: STYLES.includes(d.walkStyle) ? d.walkStyle : "walk",
      parts: { legs: boxes(d.legs), arms: boxes(d.arms), wings: boxes(d.wings) },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const NAMES = ["Pıtırcık", "Fıstık", "Bulut", "Minnoş", "Zıpzıp", "Pamuk", "Boncuk", "Şeker", "Tospik", "Limon", "Gofret", "Cıvıl"];
export const DEFAULT_LINES = [
  "Beni sen mi çizdin? Çok güzel olmuşum!",
  "Hadi oynayalım!",
  "Zıplamayı çok seviyorum!",
  "Bana bir arkadaş çizer misin?",
  "Hi hi, gıdıklanıyorum!",
  "Seninle dans edelim mi?",
];

export function offlineAnalysis(): Analysis {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  return {
    name,
    kind: "",
    emoji: "✨",
    greeting: `Merhaba! Ben ${name}. Beni canlandırdığın için teşekkürler!`,
    lines: DEFAULT_LINES,
    pitch: 1.1 + Math.random() * 0.5,
    walkStyle: "walk",
    parts: { legs: [], arms: [], wings: [] },
  };
}
