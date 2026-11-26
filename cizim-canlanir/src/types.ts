export type Box = { x: number; y: number; w: number; h: number }; // 0..1, kesilmiş çizime göre

export type WalkStyle = "walk" | "hop" | "fly" | "swim" | "slither" | "roll";

export type Character = {
  id: string;
  name: string;
  kind: string; // "kedi", "dinozor"...
  emoji: string;
  greeting: string;
  lines: string[];
  pitch: number; // konuşma sesi inceliği
  walkStyle: WalkStyle;
  parts: { legs: Box[]; arms: Box[]; wings: Box[]; head?: Box };
  acc?: string[]; // giydirme: sapka, tac, gozluk, papyon, pelerin, balon
  w: number;
  h: number;
  createdAt: number;
  ai: boolean; // yapay zekâ tanıdı mı
};

export type Settings = {
  onboarded: boolean;
  aiConsent: boolean; // ebeveyn izin verdiyse çizim tanıma için sunucuya gönderilir
};

// Sahneye giden karakter tanımı (çizim PNG'si data URL olarak)
export type StageChar = { id: string; png: string; walkStyle: WalkStyle; parts: Character["parts"]; acc?: string[]; scale?: number };

export type StoryBeat = { scene: string; text: string; narration?: string; dialogue?: { who: number; line: string }[]; actions: { who: number; action: string }[] };
export type Story = { title: string; beats: StoryBeat[] };
