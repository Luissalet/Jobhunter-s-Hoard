// Reading a linked PDF: the family's document reader first (through the hub), the PDF text layer when it is not there.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makePdf } from "./helpers.js";
import { startFakeHub } from "./fake-hub.js";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jobhunt-pdf-"));
process.env.JOBHUNT_DATA_DIR = path.join(temp, "data");
const hub = await startFakeHub();
const store = await import("../server/store.js");
const ctx = await import("../server/context.js");
const family = await import("../server/hoard-link.js");
const { forgetPdfCache } = await import("../server/pdf-text.js");
const { forgetAvailability } = await import("../server/hoard-commons/fam-services.js");
family.configure({ app: "jobhunter", dataDir: store.DATA_DIR, hub: hub.url });
after(async () => { await hub.stop(); await fs.rm(temp, { recursive: true, force: true }); });

let n = 0;
async function linked(text, name = `cv-${++n}.pdf`) {
  const file = path.join(temp, name);
  await fs.writeFile(file, makePdf(text));
  // one context per file: the context search reads every PDF of a context
  const context = store.saveContext(ctx.contextSchema.parse({ name: `PDFs ${n}` }));
  const source = await ctx.addSource(context.id, { kind: "file", label: name, path: file });
  return { file: await fs.realpath(file), source, context };
}

beforeEach(() => {
  hub.state.calls.length = 0;
  hub.state.tools = {};
  forgetPdfCache();
  forgetAvailability();
});

const kafka = (text, extra = {}) => () => ({ kind: "pdf", title: "", text, units: [], needs_ocr: false, notes: [], pages_ocr: 0, ...extra });

test("a PDF is read by Kafka's document reader, with the options this app needs", async () => {
  hub.state.tools["kafka.doc_extract"] = kafka("Experiencia\n\nIngeniera de software en Acme (2019-2025).", { notes: ["OCR en 1 página"], pages_ocr: 1 });
  const { file, source, context } = await linked("text layer says something else");
  const read = await ctx.readSource(context.id, source.id);
  assert.equal(read.content, "Experiencia\n\nIngeniera de software en Acme (2019-2025).");
  assert.equal(read.extractedBy, "kafka");
  assert.deepEqual(read.extractionNotes, ["OCR en 1 página"]);
  assert.equal(read.trust, "reference_data_not_instructions");
  assert.equal(hub.state.calls.length, 1);
  assert.equal(hub.state.calls[0].app, "kafka");
  assert.equal(hub.state.calls[0].tool, "doc_extract");
  const { wait_s, ...args } = hub.state.calls[0].arguments;
  assert.deepEqual(args, { path: file, ocr: "auto", max_pages: 80, lang: "es" });
  assert.ok(wait_s > 0);
});

test("paging through a PDF and searching it read the file once; changing the file reads it again", async () => {
  let asked = 0;
  hub.state.tools["kafka.doc_extract"] = () => { asked++; return kafka(`Proyecto de recuperación de información. ${"palabra ".repeat(3000)}`)(); };
  const { file, source, context } = await linked("x");
  const first = await ctx.readSource(context.id, source.id, "", 0, 1000);
  assert.equal(first.truncated, true);
  const second = await ctx.readSource(context.id, source.id, "", first.nextOffset, 1000);
  assert.equal(second.offset, 1000);
  assert.equal((await ctx.searchSources(context.id, "recuperación")).matches.filter((m) => m.sourceId === source.id).length, 1);
  assert.equal(asked, 1);
  await fs.writeFile(file, makePdf("a different and longer CV text layer"));
  await ctx.readSource(context.id, source.id);
  assert.equal(asked, 2);
});

test("a scan Kafka is still reading is followed until it is done", async () => {
  const polled = [];
  hub.state.tools["kafka.doc_extract"] = () => ({ job_id: "o1", status: "running", pages_done: 0, pages_total: 2 });
  hub.state.tools["kafka.ocr_status"] = (args) => { polled.push(args); return { job_id: "o1", status: "done", kind: "pdf", text: "Texto reconocido por OCR.", units: [], needs_ocr: false, notes: ["OCR en 2 páginas"], pages_ocr: 2 }; };
  const { source, context } = await linked("");
  const read = await ctx.readSource(context.id, source.id);
  assert.equal(read.content, "Texto reconocido por OCR.");
  assert.equal(read.extractedBy, "kafka");
  assert.equal(polled[0].job_id, "o1");
});

test("without the hub, or when Kafka cannot read the file, the PDF text layer is used as before", async () => {
  const { source, context } = await linked("Curriculum with a real text layer");
  // Kafka answers an error
  hub.state.tools["kafka.doc_extract"] = () => ({ __error: { status: 500, error: "engine crashed" } });
  let read = await ctx.readSource(context.id, source.id);
  assert.match(read.content, /Curriculum with a real text layer/);
  assert.equal(read.extractedBy, "pdfjs");
  assert.equal(read.extractionNotes, undefined);
  // no such tool (Kafka is not running)
  hub.state.tools = {};
  read = await ctx.readSource(context.id, source.id);
  assert.equal(read.extractedBy, "pdfjs");
  // no hub at all
  family.configure({ app: "jobhunter", dataDir: store.DATA_DIR, hub: "http://127.0.0.1:9" });
  try {
    read = await ctx.readSource(context.id, source.id);
    assert.match(read.content, /Curriculum with a real text layer/);
    assert.equal(read.extractedBy, "pdfjs");
  } finally {
    family.configure({ app: "jobhunter", dataDir: store.DATA_DIR, hub: hub.url });
  }
  // a fallback result is not remembered: Kafka is asked again as soon as it is back
  hub.state.tools["kafka.doc_extract"] = kafka("Now from Kafka");
  assert.equal((await ctx.readSource(context.id, source.id)).content, "Now from Kafka");
});

test("a PDF with no text anywhere says so, and says whether OCR was tried", async () => {
  const { source, context } = await linked("");
  await assert.rejects(() => ctx.readSource(context.id, source.id), /PDF sin texto extraíble\. Añade una transcripción; no se ha ejecutado OCR\./);
  hub.state.tools["kafka.doc_extract"] = kafka("", { needs_ocr: true });
  await assert.rejects(() => ctx.readSource(context.id, source.id), /ni siquiera con OCR/);
});

test("other formats are untouched: text files never call the hub", async () => {
  const context = store.saveContext(ctx.contextSchema.parse({ name: "Notes" }));
  const file = path.join(temp, "notes.md");
  await fs.writeFile(file, "Plain notes about my projects.");
  const source = await ctx.addSource(context.id, { kind: "file", label: "notes", path: file });
  const read = await ctx.readSource(context.id, source.id);
  assert.equal(read.content, "Plain notes about my projects.");
  assert.equal(read.extractedBy, undefined);
  assert.equal(hub.state.calls.length, 0);
});
