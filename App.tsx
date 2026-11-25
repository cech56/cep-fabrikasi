import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { generateApp } from "./src/api";
import { CARPIM_HTML } from "./src/samples/carpim";
import { Generating } from "./src/screens/Generating";
import { Home } from "./src/screens/Home";
import { Runner } from "./src/screens/Runner";
import { deleteApp, loadApps, newId, undoVersion, upsertApp, withNewVersion } from "./src/storage";
import { MiniApp } from "./src/types";

const SAMPLE: MiniApp = {
  id: "ornek-carpim",
  name: "Çarpım Tablosu",
  emoji: "✖️",
  description: "Örnek: doğru cevaba dokun, seriyi büyüt.",
  prompt: "Çarpım tablosu oyunu",
  html: CARPIM_HTML,
  createdAt: 0,
  updatedAt: 0,
  history: [],
};

export default function App() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "create" | "edit">(null);

  const refresh = useCallback(async () => {
    let list = await loadApps();
    if (list.length === 0) {
      await upsertApp(SAMPLE);
      list = [SAMPLE];
    }
    setApps(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = apps.find((a) => a.id === openId) ?? null;

  const create = async (prompt: string) => {
    setBusy("create");
    const r = await generateApp(prompt);
    setBusy(null);
    if (!r.ok) return Alert.alert("Olmadı", r.message);
    const now = Date.now();
    const app: MiniApp = { id: newId(), name: r.name, emoji: r.emoji, description: r.description, prompt, html: r.html, createdAt: now, updatedAt: now, history: [] };
    await upsertApp(app);
    await refresh();
    setOpenId(app.id);
  };

  const edit = async (instruction: string) => {
    if (!open) return;
    setBusy("edit");
    const r = await generateApp(instruction, open.html);
    setBusy(null);
    if (!r.ok) return Alert.alert("Olmadı", r.message);
    await upsertApp(withNewVersion(open, r.html, instruction));
    await refresh();
  };

  const undo = async () => {
    if (!open) return;
    const prev = undoVersion(open);
    if (prev) {
      await upsertApp(prev);
      await refresh();
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        {open ? (
          <Runner app={open} onBack={() => setOpenId(null)} onEdit={edit} onUndo={undo} />
        ) : (
          <Home
            apps={apps}
            onCreate={create}
            onOpen={(a) => setOpenId(a.id)}
            onDelete={async (a) => {
              await deleteApp(a.id);
              await refresh();
            }}
          />
        )}
        {busy && <Generating editing={busy === "edit"} />}
      </View>
    </SafeAreaProvider>
  );
}
