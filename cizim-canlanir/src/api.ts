import { getDeviceId } from "./storage";
import { Box, Character, Story, WalkStyle } from "./types";

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
      parts: { legs: boxes(d.legs), arms: boxes(d.arms), wings: boxes(d.wings), head: toBox(d.head) ?? undefined },
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

async function postJson(path: string, body: unknown, ms: number): Promise<any | null> {
  if (!API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(body as object), deviceId: await getDeviceId() }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d && !d.error ? d : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStory(chars: Character[], theme = ""): Promise<Story | null> {
  const d = await postJson("/api/story", { chars: chars.map((c) => ({ name: c.name, kind: c.kind })), theme }, 40_000);
  if (!d || !Array.isArray(d.beats) || !d.beats.length) return null;
  return d as Story;
}

// Sunucu seslendirmesi (videoya da girer). Başarısızsa null.
export async function fetchVoice(text: string, voice: string): Promise<string | null> {
  const d = await postJson("/api/tts", { text, voice }, 20_000);
  return d?.audio ?? null;
}

// Yapay zekâ kapalıyken ya da sunucuya ulaşılamazken hazır masal
export function offlineStory(chars: Character[]): Story {
  const a = chars[0]?.name ?? "Kahraman";
  const b = chars[1]?.name;
  const two = chars.length > 1;
  const w = (i: number) => (two ? i % chars.length : 0);
  const beat = (scene: string, narration: string, dialogue: { who: number; line: string }[], actions: { who: number; action: string }[]) => ({ scene, text: narration, narration, dialogue, actions });
  return {
    title: `${a} ve Kayıp Yıldız`,
    beats: [
      beat("masa", `Bir varmış bir yokmuş. Renkli kalemlerin arasında, kâğıttan çıkıp canlanan ${a} adında minik bir kahraman varmış. Bir sabah gözlerini açmış, gerinmiş ve kocaman gülümsemiş.`, [{ who: 0, line: "Günaydın! Bugün maceralı bir gün olacak!" }], [{ who: 0, action: "wave" }]),
      beat("park", `${a} pencereden süzülen rüzgâra binip parka uçmuş. Çimenler yemyeşil, çiçekler rengârenkmiş. Kelebekler etrafında dans ediyormuş.`, [{ who: 0, line: "Vay canına, burası ne kadar güzel!" }], [{ who: 0, action: "jump" }]),
      beat("park", b ? `Salıncakların yanında ${b} ile karşılaşmış. ${b} biraz üzgünmüş, çünkü gökyüzündeki en parlak yıldız kaybolmuş.` : `Salıncakların yanında küçük bir serçe ağlıyormuş. Gökyüzündeki en parlak yıldız kaybolmuş, serçe de evinin yolunu bulamıyormuş.`, b ? [{ who: 1, line: "Yıldızım kayboldu, onu bulmama yardım eder misin?" }, { who: 0, line: "Elbette! Birlikte buluruz!" }] : [{ who: 0, line: "Merak etme, yıldızı ben bulacağım!" }], [{ who: 0, action: "wave" }, { who: w(1), action: "giggle" }]),
      beat("ciftlik", `İlk önce çiftliğe gitmişler. Tavuklar gıdaklıyor, inekler mööö diye selam veriyormuş. Ama yıldız samanlıkta da yokmuş.`, [{ who: w(1), line: "Burada sadece yumurta var, yıldız yok!" }], [{ who: 0, action: "walk" }, { who: w(1), action: "walk" }]),
      beat("denizalti", `Sonra kocaman bir baloncuğun içine girip denizin dibine dalmışlar. Rengârenk balıklar onlara yol göstermiş. Bir balık, yıldızın gökyüzüne doğru uçtuğunu söylemiş.`, [{ who: 0, line: "Gökyüzü mü? O zaman bir rokete ihtiyacımız var!" }], [{ who: 0, action: "spin" }, { who: w(1), action: "spin" }]),
      beat("uzay", `Kâğıttan bir roket yapıp uzaya fırlamışlar. Gezegenler parıl parıl parlıyormuş. Ve işte orada, minik yıldız bir bulutun arkasına saklanmış, titriyormuş.`, [{ who: 0, line: "Merhaba küçük yıldız, neden saklanıyorsun?" }], [{ who: 0, action: "flip" }]),
      beat("uzay", `Yıldız çok yalnız kaldığını, kimsenin onunla oynamadığını söylemiş. ${a} ona sarılmış ve onu en güzel oyunlarına davet etmiş.`, [{ who: 0, line: "Artık yalnız değilsin, biz senin arkadaşınız!" }], [{ who: 0, action: "dance" }, { who: w(1), action: "dance" }]),
      beat("parti", `Dünyaya dönünce yıldız için kocaman bir parti vermişler. Balonlar, konfetiler ve çikolatalı bir pasta varmış. Herkes şarkı söyleyip dans etmiş.`, [{ who: w(1), line: "Yaşasın! Bu dünyanın en güzel partisi!" }], [{ who: 0, action: "dance" }, { who: w(1), action: "jump" }]),
      beat("kamp", `Gece olunca kamp ateşinin başına oturmuşlar. Yıldız gökyüzüne geri dönmüş ve onlar için her zamankinden daha parlak parlamış.`, [{ who: 0, line: "Bak, bize göz kırpıyor!" }], [{ who: 0, action: "wave" }, { who: w(1), action: "wave" }]),
      beat("masa", `${a} yorgun ama mutlu bir şekilde kâğıdına geri uzanmış. Çünkü biliyormuş ki bir arkadaşa yardım etmek dünyanın en güzel macerasıymış. Tatlı rüyalar!`, [], [{ who: 0, action: "sleep" }, { who: w(1), action: "sleep" }]),
    ],
  };
}
