import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

// İlk açılış: ebeveyne yönelik kısa tanıtım ve yapay zekâ izni.
export function Onboarding({ onDone }: { onDone: (aiConsent: boolean) => void }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={s.wrap}>
      <Text style={s.big}>🖍️✨</Text>
      <Text style={s.title}>Çizim Canlanır</Text>
      <Text style={s.sub}>Çocuğunuzun kâğıda çizdiği karakter, telefonun kamerasında masanın üstünde canlanır: yürür, zıplar, dans eder, konuşur.</Text>

      <View style={s.card}>
        <Text style={s.cardT}>Anne ve babalar için</Text>
        <Text style={s.li}>• Hesap yok, isim, yaş, e‑posta ya da fotoğraf istemiyoruz.</Text>
        <Text style={s.li}>• Çizimler ve karakterler yalnızca bu telefonda saklanır.</Text>
        <Text style={s.li}>• Kamera görüntüsü kaydedilmez; video sadece siz "Kaydet"e basınca telefonda oluşur.</Text>
        <Text style={s.li}>• Paylaşma, silme ve ayarlar anne/baba onayı ister.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardT}>Çizimi yapay zekâ tanısın mı?</Text>
        <Text style={s.li}>
          İzin verirseniz, çizimin sadece kesilmiş hâli (arka planı silinmiş küçük bir resim) karakterin ne olduğunu anlamak, ona isim ve konuşma vermek için sunucumuza gönderilir. Resim saklanmaz. İzin vermezseniz karakter yine canlanır, sadece hazır isim ve
          cümleler kullanılır. Bu seçimi Ayarlar'dan her zaman değiştirebilirsiniz.
        </Text>
      </View>

      <Pressable style={s.btn} onPress={() => onDone(true)}>
        <Text style={s.btnT}>Yapay zekâ ile başla (önerilir)</Text>
      </Pressable>
      <Pressable style={s.btn2} onPress={() => onDone(false)}>
        <Text style={s.btn2T}>Yapay zekâ olmadan başla</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 22, paddingTop: 60, paddingBottom: 40 },
  big: { fontSize: 56, textAlign: "center" },
  title: { color: C.yellow, fontSize: 32, fontWeight: "900", textAlign: "center", marginTop: 6 },
  sub: { color: C.ink, fontSize: 16, textAlign: "center", marginTop: 10, lineHeight: 22 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginTop: 18 },
  cardT: { color: C.ink, fontWeight: "800", fontSize: 16, marginBottom: 6 },
  li: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  btn: { backgroundColor: C.yellow, borderRadius: 18, padding: 16, alignItems: "center", marginTop: 22 },
  btnT: { color: C.dark, fontWeight: "900", fontSize: 17 },
  btn2: { borderRadius: 18, padding: 14, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: C.card2 },
  btn2T: { color: C.muted, fontWeight: "700", fontSize: 15 },
});
