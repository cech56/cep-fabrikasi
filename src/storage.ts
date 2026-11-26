import AsyncStorage from "@react-native-async-storage/async-storage";
import { MiniApp } from "./types";

const APPS_KEY = "cep/apps/v1";
const DEVICE_KEY = "cep/device-id";
const dataKey = (appId: string) => `cep/appdata/${appId}`;
const MAX_HISTORY = 10;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = newId() + newId();
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function loadApps(): Promise<MiniApp[]> {
  try {
    const raw = await AsyncStorage.getItem(APPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveApps(apps: MiniApp[]) {
  await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
}

export async function upsertApp(app: MiniApp) {
  const apps = await loadApps();
  const i = apps.findIndex((a) => a.id === app.id);
  if (i >= 0) apps[i] = app;
  else apps.unshift(app);
  await saveApps(apps);
}

export async function deleteApp(id: string) {
  const apps = await loadApps();
  await saveApps(apps.filter((a) => a.id !== id));
  await AsyncStorage.removeItem(dataKey(id));
}

export async function getApp(id: string): Promise<MiniApp | undefined> {
  return (await loadApps()).find((a) => a.id === id);
}

// Ortak odadan gelen verileri toplu yazar
export async function mergeAppData(appId: string, values: Record<string, unknown>) {
  const data = await getAppData(appId);
  Object.assign(data, values);
  await AsyncStorage.setItem(dataKey(appId), JSON.stringify(data));
}

const NICK_KEY = "cep/nickname";
export async function getNickname() {
  return (await AsyncStorage.getItem(NICK_KEY)) ?? "";
}
export async function setNickname(name: string) {
  await AsyncStorage.setItem(NICK_KEY, name.trim().slice(0, 20));
}

export function withNewVersion(app: MiniApp, html: string, prompt: string): MiniApp {
  const history = [{ prompt, html: app.html, at: app.updatedAt }, ...app.history].slice(0, MAX_HISTORY);
  return { ...app, html, history, updatedAt: Date.now() };
}

export function undoVersion(app: MiniApp): MiniApp | null {
  const [prev, ...rest] = app.history;
  if (!prev) return null;
  return { ...app, html: prev.html, history: rest, updatedAt: Date.now() };
}

// Mini uygulamanın kendi verisi (köprü üzerinden cep.get / cep.set)
export async function getAppData(appId: string): Promise<Record<string, unknown>> {
  try {
    const raw = await AsyncStorage.getItem(dataKey(appId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function setAppValue(appId: string, key: string, value: unknown) {
  const data = await getAppData(appId);
  data[key] = value;
  const raw = JSON.stringify(data);
  if (raw.length > 2_000_000) throw new Error("Depolama sınırı aşıldı");
  await AsyncStorage.setItem(dataKey(appId), raw);
}

// Geçmişteki bir sürüme dön (şu anki sürüm de geçmişe eklenir, yani bu da geri alınabilir)
export function restoreVersion(app: MiniApp, index: number, label: string): MiniApp {
  const target = app.history[index];
  if (!target) return app;
  const rest = app.history.filter((_, i) => i !== index);
  const history = [{ prompt: label, html: app.html, at: app.updatedAt }, ...rest].slice(0, MAX_HISTORY);
  return { ...app, html: target.html, history, updatedAt: Date.now() };
}

// ---- Yedekleme ----
export type Backup = { kind: "cep-fabrikasi-backup"; version: 1; createdAt: number; apps: MiniApp[]; data: Record<string, Record<string, unknown>> };

export async function makeBackup(): Promise<Backup> {
  const apps = await loadApps();
  const data: Backup["data"] = {};
  for (const a of apps) data[a.id] = await getAppData(a.id);
  return { kind: "cep-fabrikasi-backup", version: 1, createdAt: Date.now(), apps, data };
}

// Aynı kimlikli uygulamalar güncellenir, yeniler eklenir; mevcut başka uygulamalara dokunulmaz.
export async function restoreBackup(b: unknown): Promise<number> {
  const bk = b as Backup;
  if (!bk || bk.kind !== "cep-fabrikasi-backup" || !Array.isArray(bk.apps)) throw new Error("bad");
  const current = await loadApps();
  for (const a of bk.apps) {
    if (!a?.id || typeof a.html !== "string") continue;
    const i = current.findIndex((c) => c.id === a.id);
    if (i >= 0) current[i] = a;
    else current.push(a);
    if (bk.data?.[a.id]) await AsyncStorage.setItem(dataKey(a.id), JSON.stringify(bk.data[a.id]));
  }
  await saveApps(current);
  return bk.apps.length;
}

const ONBOARD_KEY = "cep/onboarded";
export async function isOnboarded() {
  return (await AsyncStorage.getItem(ONBOARD_KEY)) === "1";
}
export async function setOnboarded() {
  await AsyncStorage.setItem(ONBOARD_KEY, "1");
}
