import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../theme";

const STEPS = t("steps").split("|");

export function Generating({ mode }: { mode: "create" | "edit" | "load" | "fix" }) {
  const th = useTheme();
  const [i, setI] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 3500);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
    return () => clearInterval(timer);
  }, [pulse]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: th.bg }]}>
      <Animated.Text style={[styles.icon, { transform: [{ scale: pulse }] }]}>🏭</Animated.Text>
      <Text style={[styles.title, { color: th.ink }]}>{mode === "load" ? t("genLoad") : mode === "fix" ? t("genFix") : mode === "edit" ? t("genEdit") : t("genTitle")}</Text>
      <Text style={[styles.step, { color: th.muted }]}>{mode === "load" ? t("genLoadSub") : mode === "fix" ? t("genFixSub") : mode === "edit" ? t("genEditSub") : STEPS[i]}</Text>
      <ActivityIndicator color={th.accent} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", padding: 24, zIndex: 10 },
  icon: { fontSize: 72 },
  title: { fontSize: 24, fontWeight: "800", marginTop: 16 },
  step: { fontSize: 16, marginTop: 8 },
});
