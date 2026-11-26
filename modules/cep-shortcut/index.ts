import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type CepShortcutNative = {
  isSupported(): boolean;
  pin(id: string, label: string, emoji: string): string;
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
