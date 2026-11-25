import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

const STEPS = ["İsteğini anlıyorum…", "Ekranları tasarlıyorum…", "Butonları yerleştiriyorum…", "Kodu yazıyorum…", "Son rötuşlar…"];

export function Generating({ editing }: { editing?: boolean }) {
  const t = useTheme();
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
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: t.bg }]}>
      <Animated.Text style={[styles.icon, { transform: [{ scale: pulse }] }]}>🏭</Animated.Text>
      <Text style={[styles.title, { color: t.ink }]}>{editing ? "Değiştiriyorum" : "Fabrika çalışıyor"}</Text>
      <Text style={[styles.step, { color: t.muted }]}>{editing ? "Söylediğini uyguluyorum…" : STEPS[i]}</Text>
      <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", padding: 24, zIndex: 10 },
  icon: { fontSize: 72 },
  title: { fontSize: 24, fontWeight: "800", marginTop: 16 },
  step: { fontSize: 16, marginTop: 8 },
});
