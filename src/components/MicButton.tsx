import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme";

type Props = {
  // Konuşma sürerken ve bitince metni verir. base: kayda başlamadan önceki metin.
  onText: (text: string) => void;
  currentText: string;
  size?: number;
};

// Sesle yazdırma: Türkçe konuş, metin kutuya yazılsın. Ses kaydedilmez, sadece telefonun tanıma servisi kullanılır.
export function MicButton({ onText, currentText, size = 44 }: Props) {
  const t = useTheme();
  const [listening, setListening] = useState(false);
  const base = useRef("");

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (e) => {
    const said = e.results[0]?.transcript ?? "";
    onText((base.current ? base.current + " " : "") + said);
  });
  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed") Alert.alert("Mikrofon izni", "Sesle yazdırmak için mikrofon iznini açman gerekiyor.");
    else Alert.alert("Ses anlaşılamadı", "Bir daha dener misin?");
  });

  const toggle = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert("Ses tanıma yok", "Telefonunda ses tanıma servisi bulunamadı. Google uygulamasını güncellemeyi deneyebilirsin.");
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Mikrofon izni", "Sesle yazdırmak için mikrofon iznini açman gerekiyor.");
        return;
      }
      base.current = currentText.trim();
      ExpoSpeechRecognitionModule.start({ lang: "tr-TR", interimResults: true, continuous: false, addsPunctuation: true });
    } catch {
      Alert.alert("Ses tanıma başlatılamadı", "Bir daha dener misin?");
    }
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      accessibilityLabel={listening ? "Dinlemeyi durdur" : "Sesle yazdır"}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2, backgroundColor: listening ? t.danger : t.card, borderColor: listening ? t.danger : t.border }]}
    >
      <Text style={{ fontSize: size * 0.45 }}>{listening ? "⏹" : "🎤"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
