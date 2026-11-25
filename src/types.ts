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
};
