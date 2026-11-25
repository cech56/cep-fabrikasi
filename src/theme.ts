import { useColorScheme } from "react-native";

const light = { bg: "#FFF7ED", card: "#FFFFFF", ink: "#1C1917", muted: "#78716C", accent: "#F97316", accentInk: "#FFFFFF", border: "#FED7AA", danger: "#DC2626" };
const dark = { bg: "#1C1917", card: "#292524", ink: "#FAFAF9", muted: "#A8A29E", accent: "#FB923C", accentInk: "#1C1917", border: "#44403C", danger: "#F87171" };

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
