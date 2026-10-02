// The text of a linked PDF (a CV, a project write-up). First the family's document reader (Kafka's doc_extract through the hub: it
// keeps the reading order of columns and tables and runs OCR on scans); when the hub or Kafka is not there, or cannot read the file,
// the PDF text layer through pdfjs, which is what this app always did, so a standalone install loses nothing.
import { docsExtract } from "./hoard-commons/fam-services.js";

export const MAX_PAGES = 80;
// readSource is called page by page and by the context search: the same file is read many times in a row.
const CACHE_LIMIT = 40;
const cache = new Map();

const keyOf = (file, stat) => `${file}|${stat.mtimeMs}|${stat.size}`;

async function viaKafka(file, stat) {
  const key = keyOf(file, stat);
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  // OCR can take minutes for a long scan; a tool call that waits that long is worse than the fallback, so a read that is still
  // running after two minutes is left to pdfjs (and Kafka's job carries on).
  const res = await docsExtract(file, { ocr: "auto", maxPages: MAX_PAGES, lang: "es", timeoutS: 120 });
  if (!res.ok) return null;
  const found = { content: String(res.text || ""), via: "kafka", notes: (res.notes || []).filter(Boolean), ocrPages: res.pages_ocr || 0 };
  if (!found.content.trim()) return { ...found, empty: true };
  cache.set(key, found);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return found;
}

async function viaPdfjs(buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES); i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      pages.push(text.items.map((item) => item.str + (item.hasEOL ? "\n" : " ")).join(""));
    }
    let content = pages.join("\n\n");
    if (pdf.numPages > MAX_PAGES) content += `\n[PDF limitado a las primeras ${MAX_PAGES} páginas]`;
    return content;
  } finally {
    await task.destroy();
  }
}

/** { content, via: "kafka" | "pdfjs", notes } for the PDF at `file` (`buffer`: its bytes, `stat`: its fs.Stats). Throws a sentence when
 * no text can be read from it. */
export async function readPdfText(file, buffer, stat) {
  let kafka = null;
  try { kafka = await viaKafka(file, stat); } catch { kafka = null; }
  if (kafka && !kafka.empty) return { content: kafka.content, via: "kafka", notes: kafka.notes };
  const content = await viaPdfjs(buffer);
  if (!content.trim())
    throw new Error(kafka
      ? "PDF sin texto extraíble, ni siquiera con OCR. Añade una transcripción."
      : "PDF sin texto extraíble. Añade una transcripción; no se ha ejecutado OCR.");
  return { content, via: "pdfjs", notes: [] };
}

/** For tests: forget what was read. */
export const forgetPdfCache = () => cache.clear();
