import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { Character, Settings } from "./types";

const K_CHARS = "chars.v1";
const K_SETTINGS = "settings.v1";
const K_DEVICE = "device.v1";

const dir = () => {
  const d = new Directory(Paths.document, "chars");
  if (!d.exists) d.create({ idempotent: true });
  return d;
};
const pngFile = (id: string) => new File(dir(), `${id}.png`);

export function pngUri(id: string) {
  return pngFile(id).uri;
}

export async function loadChars(): Promise<Character[]> {
  try {
    const raw = await AsyncStorage.getItem(K_CHARS);
    const list: Character[] = raw ? JSON.parse(raw) : [];
    return list.filter((c) => pngFile(c.id).exists);
  } catch {
    return [];
  }
}

async function saveList(list: Character[]) {
  await AsyncStorage.setItem(K_CHARS, JSON.stringify(list));
}

export async function addChar(c: Character, pngDataUrl: string) {
  const b64 = pngDataUrl.slice(pngDataUrl.indexOf(",") + 1);
  const f = pngFile(c.id);
  if (f.exists) f.delete();
  f.create();
  await f.write(b64, { encoding: "base64" });
  const list = await loadChars();
  await saveList([c, ...list.filter((x) => x.id !== c.id)]);
}

export async function updateChar(id: string, patch: Partial<Character>) {
  const list = await loadChars();
  await saveList(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export async function deleteChar(id: string) {
  const f = pngFile(id);
  if (f.exists) f.delete();
  const list = await loadChars();
  await saveList(list.filter((c) => c.id !== id));
}

export async function deleteAll() {
  const d = new Directory(Paths.document, "chars");
  if (d.exists) d.delete();
  await AsyncStorage.removeItem(K_CHARS);
}

export async function pngDataUrl(id: string): Promise<string> {
  return "data:image/png;base64," + (await pngFile(id).base64());
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(K_SETTINGS);
    return { onboarded: false, aiConsent: false, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { onboarded: false, aiConsent: false };
  }
}

export async function saveSettings(s: Settings) {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}

// Rastgele cihaz numarası: sadece sunucudaki günlük kullanım sınırı için. Kişisel bilgi değildir.
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(K_DEVICE);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(K_DEVICE, id);
  }
  return id;
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
