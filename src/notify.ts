// Mini uygulamaların hatırlatıcıları: cep.notify / cep.cancelNotify köprüsü buraya gelir.
// Bildirimler telefonda yerel olarak kurulur; sunucuya hiçbir şey gitmez.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { LANG } from "./i18n";

const CHANNEL = "hatirlatici";
const MAX_PER_APP = 30;
const key = (appId: string) => `cep/notif/${appId}`;

export function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: LANG === "tr" ? "Hatırlatıcılar" : "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function ids(appId: string): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key(appId))) ?? "[]");
  } catch {
    return [];
  }
}

async function saveIds(appId: string, list: string[]) {
  await AsyncStorage.setItem(key(appId), JSON.stringify(list));
}

export type NotifyOptions = { title?: unknown; body?: unknown; at?: unknown; inSeconds?: unknown; daily?: unknown; everyMinutes?: unknown };

function trigger(o: NotifyOptions): Notifications.SchedulableNotificationTriggerInput {
  const T = Notifications.SchedulableTriggerInputTypes;
  if (typeof o.daily === "string") {
    const m = o.daily.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('daily "SS:DD" biçiminde olmalı (örn. "09:30")');
    return { type: T.DAILY, hour: +m[1], minute: +m[2], channelId: CHANNEL };
  }
  if (o.everyMinutes !== undefined) {
    const min = Math.max(15, Math.round(Number(o.everyMinutes) || 0));
    return { type: T.TIME_INTERVAL, seconds: min * 60, repeats: true, channelId: CHANNEL };
  }
  if (o.at !== undefined) {
    const at = Number(o.at);
    if (!at || at < Date.now() + 1000) throw new Error("at gelecekte bir zaman olmalı");
    return { type: T.DATE, date: at, channelId: CHANNEL };
  }
  const sec = Math.max(1, Math.round(Number(o.inSeconds) || 0));
  if (!o.inSeconds) throw new Error("at, inSeconds, daily ya da everyMinutes gerekli");
  return { type: T.TIME_INTERVAL, seconds: sec, repeats: false, channelId: CHANNEL };
}

// Bildirime dokununca ilgili mini uygulama açılır (cepfabrikasi://app/<id>).
export async function scheduleForApp(appId: string, appName: string, o: NotifyOptions, deniedMessage: string): Promise<string> {
  if (!(await ensurePermission())) throw new Error(deniedMessage);
  const list = await ids(appId);
  if (list.length >= MAX_PER_APP) {
    const oldest = list.shift()!;
    await Notifications.cancelScheduledNotificationAsync(oldest).catch(() => {});
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: String(o.title ?? appName).slice(0, 80),
      body: String(o.body ?? "").slice(0, 240),
      data: { url: `cepfabrikasi://app/${appId}` },
    },
    trigger: trigger(o),
  });
  list.push(id);
  await saveIds(appId, list);
  return id;
}

export async function cancelForApp(appId: string, id: string) {
  const list = await ids(appId);
  if (!list.includes(id)) return false; // başka uygulamanın hatırlatıcısına dokunamaz
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await saveIds(
    appId,
    list.filter((x) => x !== id),
  );
  return true;
}

export async function cancelAllForApp(appId: string) {
  for (const id of await ids(appId)) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await AsyncStorage.removeItem(key(appId));
}

export function onNotificationOpen(handler: (url: string) => void) {
  const pick = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === "string") handler(url);
  };
  pick(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(pick);
  return () => sub.remove();
}
