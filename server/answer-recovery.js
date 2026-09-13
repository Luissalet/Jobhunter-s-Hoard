// Extracción de respuestas históricas desde ficheros privados del usuario
// (prepare-*.mjs, *-attempt.json, *-result*.json). Solo lectura de texto:
// nunca import(), nunca eval(), nunca ejecuta nada. El directorio lo elige
// el usuario desde la UI/endpoint; este módulo no navega fuera de él.
import fs from "node:fs";
import path from "node:path";

const JSON_PATTERN = /(^|[-_])attempt\.json$|(^|[-_])result.*\.json$/i;
const MJS_PATTERN = /^prepare-.*\.mjs$/i;

function unescapeJsString(s) {
  return s.replace(/\\(.)/g, (_, ch) =>
    ({ n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', "`": "`" }[ch] ?? ch),
  );
}

// Recorre un JSON arbitrario buscando pares pregunta/respuesta bajo las
// claves habituales (question/answer, label/value) o dentro de arrays
// anidados (questions, answers, fields, items, responses).
function collectFromJson(node, out, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  if (typeof node === "object") seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectFromJson(item, out, seen);
    return;
  }
  const q = node.question ?? node.label ?? node.q;
  const a = node.answer ?? node.value ?? node.a;
  if (typeof q === "string" && q.trim() && typeof a === "string")
    out.push({ question: q, answer: a });
  for (const [k, v] of Object.entries(node))
    if (v && typeof v === "object") collectFromJson(v, out, seen);
}

function extractJsonFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const out = [];
  collectFromJson(data, out);
  return out;
}

// Solo literales string: nunca import() ni eval(). Reconoce
// `{ question: "...", answer: "..." }` y `{ label: "...", value: "..." }`
// con comillas simples, dobles o backticks, en cualquier orden de claves.
function extractMjsFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const out = [];
  const pair = (keyA, keyB) =>
    new RegExp(
      `${keyA}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1\\s*,\\s*${keyB}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\3).)*)\\3`,
      "gs",
    );
  for (const [ka, kb] of [
    ["question", "answer"],
    ["label", "value"],
  ]) {
    for (const m of raw.matchAll(pair(ka, kb)))
      out.push({
        question: unescapeJsString(m[2]),
        answer: unescapeJsString(m[4]),
      });
    // orden invertido en el literal: answer/value antes que question/label
    for (const m of raw.matchAll(pair(kb, ka)))
      out.push({
        question: unescapeJsString(m[4]),
        answer: unescapeJsString(m[2]),
      });
  }
  return out;
}

export function extractFromFiles(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  let filesScanned = 0;
  const candidates = [];
  const unparsed = [];
  for (const name of entries) {
    const isJson = JSON_PATTERN.test(name);
    const isMjs = MJS_PATTERN.test(name);
    if (!isJson && !isMjs) continue;
    filesScanned++;
    const file = path.join(dir, name);
    let found = [];
    try {
      found = isJson ? extractJsonFile(file) ?? [] : extractMjsFile(file);
    } catch {
      found = [];
    }
    if (!found.length) {
      unparsed.push(name);
      continue;
    }
    for (const c of found)
      if (c.question?.trim())
        candidates.push({ question: c.question, answer: c.answer ?? "", source: name });
  }
  return { filesScanned, candidates, unparsed };
}
