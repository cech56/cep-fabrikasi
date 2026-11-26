import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text } from "react-native";
import { getLang, t } from "../i18n";
import { useTheme } from "../theme";

type Props = {
  // Konuşma sürerken ve bitince metni verir. base: kayda başlamadan önceki metin.
  onText: (text: string) => void;
  currentText: string;
  size?: number;
};

// Sesle yazdırma: Türkçe konuş, metin kutuya yazılsın. Ses kaydedilmez, sadece telefonun tanıma servisi kullanılır.
export function MicButton({ onText, currentText, size = 44 }: Props) {
  const th = useTheme();
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
    if (e.error === "not-allowed") Alert.alert(t("micPerm"), t("micPermBody"));
    else Alert.alert(t("micFail"), t("micFailBody"));
  });

  const toggle = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert(t("micNone"), t("micNoneBody"));
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        // "Bir daha sorma" seçildiyse sistem penceresi çıkmaz; ayarlara yönlendir
        Alert.alert(t("micPerm"), perm.canAskAgain ? t("micPermBody") : t("micSettings"), [
          { text: t("cancel"), style: "cancel" },
          { text: t("openSettings"), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      base.current = currentText.trim();
      ExpoSpeechRecognitionModule.start({ lang: getLang() === "tr" ? "tr-TR" : "en-US", interimResults: true, continuous: false, addsPunctuation: true });
    } catch {
      Alert.alert(t("micFail"), t("micFailBody"));
    }
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      accessibilityLabel={listening ? "Dinlemeyi durdur" : "Sesle yazdır"}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2, backgroundColor: listening ? th.danger : th.card, borderColor: listening ? th.danger : th.border }]}
    >
      <Text style={{ fontSize: size * 0.45 }}>{listening ? "⏹" : "🎤"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
