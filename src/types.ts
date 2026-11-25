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
};

export type VitrinItem = Omit<SharedApp, "html" | "prompt" | "parent_id">;
