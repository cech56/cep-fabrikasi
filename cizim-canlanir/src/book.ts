import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { pngDataUrl } from "./storage";
import { Character } from "./types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const COLORS = ["#FFE9A8", "#D8CCFF", "#C9F2EE", "#FFD6E2", "#E3F5D0"];

// Çocuğun bütün karakterlerinden yazdırılabilir bir kitap (PDF)
export async function makeBook(chars: Character[]) {
  const pages: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const img = await pngDataUrl(c.id);
    const date = new Date(c.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    pages.push(`
      <section class="page" style="background:${COLORS[i % COLORS.length]}">
        <div class="num">${i + 1}</div>
        <img src="${img}" />
        <h2>${esc(c.emoji)} ${esc(c.name)}</h2>
        ${c.kind ? `<div class="kind">${esc(c.kind)}</div>` : ""}
        <p class="quote">“${esc(c.greeting)}”</p>
        <div class="date">Canlandığı gün: ${esc(date)}</div>
      </section>`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    body { margin: 0; font-family: sans-serif; color: #2b2140; }
    .page { width: 210mm; height: 297mm; box-sizing: border-box; padding: 22mm 18mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; position: relative; }
    .cover { background: #1B1530; color: #fff; }
    .cover h1 { font-size: 46pt; color: #FFD23F; margin: 0; text-align: center; }
    .cover p { font-size: 16pt; opacity: .8; }
    .page img { max-width: 150mm; max-height: 150mm; filter: drop-shadow(0 4mm 3mm rgba(0,0,0,.25)); }
    h2 { font-size: 30pt; margin: 10mm 0 2mm; }
    .kind { font-size: 14pt; opacity: .7; text-transform: capitalize; }
    .quote { font-size: 17pt; font-style: italic; text-align: center; max-width: 150mm; }
    .date { position: absolute; bottom: 14mm; font-size: 11pt; opacity: .6; }
    .num { position: absolute; top: 12mm; right: 16mm; font-size: 14pt; opacity: .5; }
  </style></head><body>
    <section class="page cover"><h1>✨ Karakter Kitabım ✨</h1><p>${chars.length} karakter · Çizim Canlanır</p></section>
    ${pages.join("")}
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Karakter Kitabım", UTI: "com.adobe.pdf" });
}
