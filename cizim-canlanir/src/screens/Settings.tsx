import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../api";
import { makeBook } from "../book";
import { C } from "../theme";
import { Character, Settings as S } from "../types";

type Props = { settings: S; chars: Character[]; count: number; onChange: (s: S) => void; onDeleteAll: () => void; onBack: () => void };

export function Settings({ settings, chars, count, onChange, onDeleteAll, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={s.back}>‹ Geri</Text>
      </Pressable>
      <Text style={s.title}>Ebeveyn ayarları</Text>

      <View style={s.card}>
        <View style={s.row}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={s.cardT}>Çizimi yapay zekâ tanısın</Text>
            <Text style={s.small}>Açıkken çizimin kesilmiş küçük hâli, isim ve konuşma üretmek için sunucuya gönderilir ve saklanmaz. Kapalıyken hiçbir şey gönderilmez.</Text>
          </View>
          <Switch value={settings.aiConsent} onValueChange={(v) => onChange({ ...settings, aiConsent: v })} trackColor={{ true: C.purple }} />
        </View>
      </View>

      <Pressable
        style={s.card}
        disabled={busy || !chars.length}
        onPress={async () => {
          setBusy(true);
          try {
            await makeBook(chars);
          } catch {
            Alert.alert("Kitap oluşturulamadı");
          }
          setBusy(false);
        }}
      >
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardT}>📖 Karakter kitabını oluştur (PDF)</Text>
            <Text style={s.small}>{chars.length ? `${chars.length} karakterle yazdırılabilir bir kitap. Kaydedebilir, yazdırabilir ya da aile grubuna gönderebilirsiniz.` : "Önce bir çizim canlandırın."}</Text>
          </View>
          {busy && <ActivityIndicator color={C.yellow} />}
        </View>
      </Pressable>

      <View style={[s.card, { borderColor: C.yellow, borderWidth: 1 }]}>
        <Text style={s.cardT}>⭐ Çizim Canlanır Pro · 99 TL/ay</Text>
        <Text style={s.small}>Sınırsız karakter, filigransız video, yeni danslar ve sahneler. Çok yakında.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardT}>Gizlilik</Text>
        <Text style={s.small}>Hesap yok, kişisel bilgi toplanmaz. Karakterler sadece bu telefonda saklanır. Kamera görüntüsü kaydedilmez. Uygulama reklam göstermez.</Text>
        {!!API_URL && (
          <Pressable onPress={() => Linking.openURL(`${API_URL}/gizlilik`)}>
            <Text style={s.link}>Gizlilik politikasının tamamı</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={[s.card, { alignItems: "center" }]}
        onPress={() =>
          Alert.alert("Tüm karakterler silinsin mi?", `${count} karakter bu telefondan kalıcı olarak silinecek.`, [
            { text: "Vazgeç", style: "cancel" },
            { text: "Sil", style: "destructive", onPress: onDeleteAll },
          ])
        }
      >
        <Text style={{ color: C.pink, fontWeight: "800" }}>Tüm karakterleri sil</Text>
      </Pressable>
      <Text style={s.ver}>Sürüm 0.4 · deneme</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  back: { color: C.muted, fontSize: 17 },
  title: { color: C.ink, fontSize: 26, fontWeight: "900", marginTop: 10 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center" },
  cardT: { color: C.ink, fontWeight: "800", fontSize: 16 },
  small: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  link: { color: C.purple, marginTop: 8, fontWeight: "700" },
  ver: { color: C.muted, textAlign: "center", marginTop: 20, fontSize: 12 },
});
