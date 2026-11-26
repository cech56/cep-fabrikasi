export type MiniApp = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string; // ilk istek
  html: string;
  createdAt: number;
  updatedAt: number;
  history: { prompt: string; html: string; at: number }[]; // geri alma için önceki sürümler
  sharedId?: string; // paylaşıldıysa vitrindeki kimliği
  sharedHtml?: string; // paylaşılan sürüm (değişince yeniden paylaşmak için)
  parentId?: string; // başkasından alındıysa kaynak uygulama
  category?: string;
  roomId?: string; // "birlikte kullan" odası
  roomSince?: number; // odadan alınan son değişikliğin zamanı (sunucu saati)
};

export type SharedApp = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
  html: string;
  parent_id: string | null;
  created_at: number;
  views: number;
  remixes: number;
  likes: number;
  category: string;
  author: string;
};

export type VitrinItem = Omit<SharedApp, "html" | "prompt" | "parent_id"> & { liked?: number };

export type Room = { id: string; name: string; emoji: string; description: string; html: string; data: Record<string, string>; now: number };
