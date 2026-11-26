// Ana ekrandaki hazır fikirler: tek dokunuşla isteği doldurur.
import { getLang } from "./i18n";

const TR = [
  { emoji: "🛒", title: "Market listesi", prompt: "Market alışveriş listesi. Ürün ekleyeyim, aldıklarımın üstü çizilsin, kategorilere göre gruplansın, alınanları tek tuşla temizleyeyim." },
  { emoji: "💸", title: "Aylık bütçe", prompt: "Aylık bütçe takibi. Gelir ve giderlerimi kategoriyle gireyim, ay sonunda ne kadar kaldığını ve en çok neye harcadığımı renkli bir grafikle göreyim." },
  { emoji: "⏰", title: "Hatırlatıcı", prompt: "Günlük hatırlatıcı. 'Su iç', 'yürüyüşe çık' gibi şeyleri saatiyle ekleyeyim, her gün o saatte bildirimle hatırlatsın, istediğimi kapatabileyim." },
  { emoji: "🏠", title: "Ev işleri (ailece)", prompt: "Aile için ortak ev işleri tablosu. İşleri ekleyelim, kime verildiğini seçelim, yapılınca işaretleyelim, bu hafta en çok kim yaptı görelim." },
  { emoji: "⚽", title: "Halı saha skor", prompt: "Halı saha maçı için iki takımlı skor tutucu. Takım isimlerini yazayım, gol atanı kaydedeyim, maç süresi sayacı olsun, geçmiş maçlar listelensin." },
  { emoji: "📚", title: "Kelime kartları", prompt: "İngilizce kelime ezber kartları. Kelime ve anlamını ekleyeyim, kartı çevirince anlamı görünsün, bildiklerim ve bilmediklerim ayrı tutulsun." },
  { emoji: "💍", title: "Düğün davetlileri", prompt: "Düğün davetli listesi. Kişi ve kaç kişi geleceğini ekleyeyim, geliyor / gelmiyor / belirsiz diye işaretleyeyim, toplam kişi sayısı üstte yazsın." },
  { emoji: "🧒", title: "Çocuk görev tablosu", prompt: "Çocuğum için günlük görev ve yıldız tablosu. Diş fırçalama, oda toplama gibi görevler olsun, tamamladıkça yıldız kazansın, 10 yıldızda kutlama animasyonu çıksın." },
];

const EN = [
  { emoji: "🛒", title: "Shopping list", prompt: "Grocery shopping list. Let me add items, cross out what I've bought, group them by category, and clear bought items with one tap." },
  { emoji: "💸", title: "Monthly budget", prompt: "Monthly budget tracker. Let me enter income and expenses with categories and see what's left and where I spend most in a colorful chart." },
  { emoji: "💊", title: "Reminder", prompt: "Daily reminders. Let me add things like 'drink water' or 'take a walk' with a time, and remind me with a notification every day at that time." },
  { emoji: "📚", title: "Flashcards", prompt: "Vocabulary flashcards. Let me add a word and its meaning, flip the card to see the meaning, and keep known and unknown words separate." },
  { emoji: "🏠", title: "Family chores", prompt: "Shared family chore board. Add chores, assign them to family members, check them off, and show who did the most this week." },
  { emoji: "🧒", title: "Kids star chart", prompt: "Daily task and star chart for my child. Tasks like brushing teeth and tidying up, earn a star for each, and a celebration animation at 10 stars." },
];

export const templates = () => (getLang() === "tr" ? TR : EN);
