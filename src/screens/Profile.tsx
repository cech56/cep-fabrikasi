import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { t } from "../i18n";
import { useTheme } from "../theme";

type Props = { visible: boolean; nickname: string; onSave: (name: string) => void; onClose: () => void };

// Vitrinde görünen takma ad
export function Profile({ visible, nickname, onSave, onClose }: Props) {
  const th = useTheme();
  const [name, setName] = useState(nickname);
  useEffect(() => setName(nickname), [nickname, visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { backgroundColor: th.bg }]}>
          <Text style={[styles.title, { color: th.ink }]}>👤 {t("nickTitle")}</Text>
          <Text style={{ color: th.muted, fontSize: 14, marginBottom: 12 }}>{t("nickBody")}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={20}
            placeholder={t("nickPlaceholder")}
            placeholderTextColor={th.muted}
            style={[styles.input, { color: th.ink, borderColor: th.border, backgroundColor: th.card }]}
          />
          <Pressable
            onPress={() => {
              onSave(name.trim());
              onClose();
            }}
            style={[styles.cta, { backgroundColor: th.accent }]}
          >
            <Text style={{ color: th.accentInk, fontSize: 17, fontWeight: "800" }}>{t("save")}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: "center", padding: 14 }}>
            <Text style={{ color: th.accent, fontSize: 16, fontWeight: "600" }}>{t("close")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 },
  cta: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 },
});
