import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type CepShortcutNative = {
  isSupported(): boolean;
  pin(id: string, label: string, emoji: string): string;
  torch(on: boolean): boolean;
  setWidget(appId: string, title: string, body: string): number;
  updateWidget(appId: string, body: string): boolean;
  widgetAppId(): string | null;
  widgetCount(): number;
  requestPinWidget(): boolean;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<CepShortcutNative>("CepShortcut") : null;

// Android'de buton hep görünür; sonuç ne olduğunu söyler.
export function canPinShortcut(): boolean {
  return Platform.OS === "android";
}

export type PinResult = "pinned" | "dynamic" | "no-module" | `error: ${string}`;

export function pinShortcut(id: string, label: string, emoji: string): PinResult {
  if (!native) return "no-module";
  try {
    return native.pin(id, label, emoji) === "pinned" ? "pinned" : "dynamic";
  } catch (e: any) {
    return `error: ${String(e?.message ?? e).slice(0, 120)}`;
  }
}

export function setTorch(on: boolean) {
  if (!native) throw new Error("unsupported");
  return native.torch(on);
}

// Widget'a koy: sayıyı döner (0 ise kullanıcı henüz widget eklememiş)
export function setWidgetApp(appId: string, title: string, body: string): number {
  return native ? native.setWidget(appId, title, body) : -1;
}

export function updateWidgetBody(appId: string, body: string) {
  try {
    native?.updateWidget(appId, body);
  } catch {}
}

export function widgetAppId(): string | null {
  try {
    return native?.widgetAppId() ?? null;
  } catch {
    return null;
  }
}

export function requestPinWidget(): boolean {
  try {
    return !!native?.requestPinWidget();
  } catch {
    return false;
  }
}
