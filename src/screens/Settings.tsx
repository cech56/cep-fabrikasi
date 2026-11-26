import * as Application from "expo-application";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL } from "../api";
import { getLang, t } from "../i18n";
import { makeBackup, restoreBackup } from "../storage";
import { useTheme } from "../theme";

type Props = {
  visible: boolean;
  nickname: string;
  onSaveNickname: (name: string) => void;
  onToggleLang: () => void;
  onRestored: () => void;
  onClose: () => void;
};

const base = () => API_URL.replace(/\/$/, "");

// Ayarlar: takma ad, dil, yedekleme, gizlilik ve şartlar
export function Settings({ visible, nickname, onSaveNickname, onToggleLang, onRestored, onClose }: Props) {
  const th = useTheme();
  const [name, setName] = useState(nickname);
  useEffect(() => setName(nickname), [nickname, visible]);

  const backup = async () => {
    try {
      const data = JSON.stringify(await makeBackup());
      const day = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `cep-fabrikasi-yedek-${day}.json`);
      if (file.exists) file.delete();
      file.create();
      await file.write(data);
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: t("backup") });
    } catch (e: any) {
      Alert.alert(t("failed"), e?.message ?? t("somethingWrong"));
    }
  };

  const restore = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await new File(res.assets[0].uri).text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("restoreBad"));
      }
      const n = await restoreBackup(parsed).catch(() => {
        throw new Error(t("restoreBad"));
      });
      onRestored();
      Alert.alert(t("restoreDone", { n }));
    } catch (e: any) {
      Alert.alert(t("failed"), e?.message ?? t("somethingWrong"));
    }
  };

  const Row = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: th.border, backgroundColor: th.card, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: th.ink, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { backgroundColor: th.bg }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: th.ink }]}>⚙️ {t("settings")}</Text>

            <Text style={[styles.label, { color: th.ink }]}>👤 {t("nickTitle")}</Text>
            <Text style={{ color: th.muted, fontSize: 13, marginBottom: 8 }}>{t("nickBody")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={20}
                placeholder={t("nickPlaceholder")}
                placeholderTextColor={th.muted}
                style={[styles.input, { color: th.ink, borderColor: th.border, backgroundColor: th.card }]}
              />
              <Pressable onPress={() => onSaveNickname(name.trim())} style={[styles.small, { backgroundColor: th.accent }]}>
                <Text style={{ color: th.accentInk, fontWeight: "800" }}>{t("save")}</Text>
              </Pressable>
            </View>

            <Text style={[styles.label, { color: th.ink }]}>🌐 {t("langTitle")}</Text>
            <Row label={getLang() === "tr" ? "🇹🇷 Türkçe → 🇬🇧 English" : "🇬🇧 English → 🇹🇷 Türkçe"} onPress={onToggleLang} />

            <Text style={[styles.label, { color: th.ink }]}>💾 {t("backup").replace("💾 ", "")}</Text>
            <Text style={{ color: th.muted, fontSize: 13, marginBottom: 8 }}>{t("backupBody")}</Text>
            <Row label={t("backup")} onPress={backup} />
            <Row label={t("restore")} onPress={restore} />

            <View style={{ height: 12 }} />
            <Row label={`🔒 ${t("privacy")}`} onPress={() => Linking.openURL(`${base()}/${getLang() === "tr" ? "gizlilik" : "privacy"}`)} />
            <Row label={`📄 ${t("terms")}`} onPress={() => Linking.openURL(`${base()}/${getLang() === "tr" ? "kosullar" : "terms"}`)} />
            <Text style={{ color: th.muted, fontSize: 12, textAlign: "center", marginTop: 12 }}>{t("version", { v: Application.nativeApplicationVersion ?? "" })}</Text>

            <Pressable onPress={onClose} style={{ alignItems: "center", padding: 14 }}>
              <Text style={{ color: th.accent, fontSize: 16, fontWeight: "600" }}>{t("close")}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  label: { fontSize: 16, fontWeight: "700", marginTop: 18, marginBottom: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  small: { borderRadius: 14, paddingHorizontal: 16, justifyContent: "center" },
  row: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8 },
});
