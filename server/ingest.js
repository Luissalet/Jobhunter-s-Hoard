// "Add a posting" from a link or from pasted text. A link is read in this order: the page's schema.org JobPosting data (exact, free,
// no model call), then the page text through the model. Pasted text always goes through the model.
import { stripHtml } from "./sources.js";
import { htmlToText, jsonldBlocks, jsonldNodes, normalizeUrl, pageMeta, quality } from "./hoard-commons/web.js";
import { getPage, pageProblem } from "./net-policy.js";
import { llmJson, extractPrompt } from "./llm.js";
import * as store from "./store.js";

const PASTE_HINT = " Copia y pega el texto de la oferta.";
const MAX_DESCRIPTION = 12_000;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** A name from a string, an object with `name`, or the first usable item of a list. */
function nameOf(value) {
  if (Array.isArray(value)) { for (const v of value) { const n = nameOf(v); if (n) return n; } return ""; }
  if (isObj(value)) return nameOf(value.name ?? value.legalName ?? value.value ?? "");
  return clean(value);
}

function placeText(place) {
  if (typeof place === "string") return clean(place);
  if (!isObj(place)) return "";
  const a = place.address;
  if (typeof a === "string") return clean(a);
  if (!isObj(a)) return nameOf(place.name);
  const country = nameOf(a.addressCountry);
  return [nameOf(a.addressLocality), nameOf(a.addressRegion), country].filter(Boolean).join(", ");
}

function salaryText(base) {
  if (!isObj(base)) return "";
  const v = isObj(base.value) ? base.value : { value: base.value };
  const num = (x) => (x === undefined || x === null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
  const min = num(v.minValue), max = num(v.maxValue), one = num(v.value);
  const amount = min !== null && max !== null && min !== max ? `${min}-${max}` : String(min ?? max ?? one ?? "");
  if (!amount) return "";
  const unit = clean(v.unitText || base.unitText).toLowerCase();
  return `${amount} ${clean(base.currency)}${unit ? `/${unit}` : ""}`.replace(/\s+/g, " ").trim();
}

const listOf = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function tagsOf(posting) {
  const out = [];
  for (const raw of [posting.skills, posting.occupationalCategory, posting.industry]) {
    for (const item of listOf(raw)) for (const part of nameOf(item).split(/[,;\n]/)) { const t = clean(part); if (t && !out.includes(t)) out.push(t); }
  }
  return out.slice(0, 12);
}

/** The text of the description of a posting: schema.org says HTML, many sites escape it, some send plain text. */
function descriptionText(raw) {
  let html = String(raw ?? "");
  // escaped markup ("&lt;p&gt;...") comes out of the entity decoding as literal tags: decode once more, then read it as HTML
  if (!/<[a-z][^>]*>/i.test(html) && /&lt;\/?[a-z][^&]*&gt;/i.test(html)) html = htmlToText(html, { dropChrome: false }).text;
  return stripHtml(html).slice(0, MAX_DESCRIPTION).trim();
}

/** A tracker job (the fields /api/ingest used to get from the model) from one schema.org JobPosting node; null when it lacks a title
 * or a description worth keeping. */
export function jobFromPosting(posting, { pageLang = "" } = {}) {
  const title = clean(posting.title || posting.name);
  const description = descriptionText(posting.description);
  if (!title || description.length < 40) return null;
  const remote = clean(posting.jobLocationType).toUpperCase() === "TELECOMMUTE";
  const places = listOf(posting.jobLocation).map(placeText).filter(Boolean);
  const reach = listOf(posting.applicantLocationRequirements).map(nameOf).filter(Boolean);
  let location = places.slice(0, 3).join(" / ");
  if (!location && remote) location = reach.length ? `Remote (${reach.join(", ")})` : "Remote";
  const lang = clean(Array.isArray(posting.inLanguage) ? posting.inLanguage[0] : posting.inLanguage ? nameOf(posting.inLanguage) : pageLang).slice(0, 2).toLowerCase();
  const posted = Date.parse(posting.datePosted);
  return {
    title,
    company: nameOf(posting.hiringOrganization) || nameOf(posting.employer),
    location,
    remote: remote ? true : null,
    salary: salaryText(posting.baseSalary),
    lang: /^[a-z]{2}$/.test(lang) ? lang : undefined,
    tags: tagsOf(posting),
    description,
    postedAt: Number.isNaN(posted) ? null : new Date(posted).toISOString(),
  };
}

/** The posting a page is about, from its JSON-LD: the only JobPosting, or among several the one whose url is the page's. */
export function postingFromHtml(html, pageUrl) {
  const [blocks] = jsonldBlocks(html);
  const found = jsonldNodes(blocks, ["JobPosting"]);
  if (!found.length) return null;
  let pick = found.length === 1 ? found[0] : null;
  if (!pick) {
    const here = normalizeUrl(pageUrl, { stripRef: true });
    pick = found.find((p) => here && normalizeUrl(String(p.url ?? p["@id"] ?? ""), { stripRef: true }) === here) || null;
  }
  return pick ? jobFromPosting(pick, { pageLang: pageMeta(html, pageUrl).lang }) : null;
}

const hostLabel = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Save the posting at `url` (or the pasted `text`) in the tracker. Throws a sentence for the person when it cannot be read. */
export async function ingestPosting({ url = "", text = "" } = {}) {
  let target = String(url || "").trim();
  if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) target = `https://${target}`;
  const source = target ? hostLabel(target) || "web" : "pegado";
  let raw = String(text || "");
  if (!raw && target) {
    // A posting that is already tracked costs neither a download nor a model call.
    const known = store.findDuplicate({ url: target });
    if (known) return known;
    const res = await getPage(target);
    if (!res.ok || res.truncated || res.text_truncated) throw new Error(pageProblem(res) + PASTE_HINT);
    const html = String(res.text ?? "");
    const finalUrl = res.final_url || target;
    const structured = postingFromHtml(html, finalUrl);
    if (structured) return store.addJob({ ...structured, url: target, source });
    const page = htmlToText(html);
    if (quality(page.text) === "blocked page")
      throw new Error("La página pide verificación (captcha, JavaScript o acceso denegado) y no hay oferta que leer." + PASTE_HINT);
    raw = page.text;
  }
  if (!raw.trim()) {
    const error = new Error(target ? "La página no tiene texto que leer." + PASTE_HINT : "Pega una URL o el texto de la oferta");
    if (!target) error.status = 400;
    throw error;
  }
  const extracted = await llmJson(extractPrompt(raw, target), { temperature: 0.2 });
  return store.addJob({ ...extracted, url: target || extracted.applyUrl || "", source });
}
