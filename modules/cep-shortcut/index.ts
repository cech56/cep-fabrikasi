import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type CepShortcutNative = {
  isSupported(): boolean;
  pin(id: string, label: string, emoji: string): boolean;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<CepShortcutNative>("CepShortcut") : null;

export function canPinShortcut(): boolean {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
}

export function pinShortcut(id: string, label: string, emoji: string): boolean {
  try {
    return !!native?.pin(id, label, emoji);
  } catch {
    return false;
  }
}
