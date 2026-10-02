// POST /api/ingest: reading a posting from a link (JobPosting data first, then the page text through the model) or from pasted text,
// and which addresses it may open. Real server process; the job page, the model and the hub are local stand-ins.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { startServer, serve, post, json } from "./helpers.js";
import { startFakeHub } from "./fake-hub.js";

const cleanup = [];
after(async () => { for (const fn of cleanup.reverse()) await fn(); });

const posting = (extra = {}) => ({
  "@context": "https://schema.org", "@type": "JobPosting",
  title: "Senior Node.js Engineer",
  description: "&lt;p&gt;Build the platform that runs our API.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node.js&lt;/li&gt;&lt;li&gt;PostgreSQL&lt;/li&gt;&lt;/ul&gt;",
  datePosted: "2026-09-20",
  hiringOrganization: { "@type": "Organization", name: "Acme Systems" },
  jobLocationType: "TELECOMMUTE",
  applicantLocationRequirements: [{ "@type": "Country", name: "Spain" }, { "@type": "Country", name: "Portugal" }],
  baseSalary: { "@type": "MonetaryAmount", currency: "EUR", value: { "@type": "QuantitativeValue", minValue: 55000, maxValue: 70000, unitText: "YEAR" } },
  skills: "Node.js, PostgreSQL, Docker",
  inLanguage: "en",
  ...extra,
});
const page = (body, head = "") => `<!doctype html><html lang="en"><head><title>Job</title>${head}</head><body>${body}</body></html>`;
const ld = (value) => `<script type="application/ld+json">${typeof value === "string" ? value : JSON.stringify(value)}</script>`;

/** The app with a model, a job site and (optionally) a hub on the side. */
async function world({ privateUrls = true, hub = null, env = {} } = {}) {
  const site = { hits: [], pages: {} };
  const jobs = await serve((req, res) => {
    site.hits.push(req.url);
    const entry = site.pages[req.url.split("?")[0]];
    if (!entry) { res.statusCode = 404; return res.end("not here"); }
    const out = typeof entry === "function" ? entry(req, res) : entry;
    if (out === undefined) return;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(out);
  });
  const llm = { prompts: [], reply: { title: "From the model", company: "Model Co", location: "Madrid", remote: false, salary: "", lang: "es", tags: ["a"], applyUrl: "", description: "Described by the model." } };
  const model = await serve((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      llm.prompts.push(JSON.parse(raw).messages[0].content);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: { content: JSON.stringify(llm.reply) } }));
    });
  });
  const app = await startServer({ env: { ...(privateUrls ? { JOBHUNT_ALLOW_PRIVATE_URLS: "1" } : {}), ...(hub ? { HOARD_HUB_URL: hub.url } : {}), ...env } });
  cleanup.push(() => app.stop(), () => jobs.close(), () => model.close(), () => fs.rm(app.data, { recursive: true, force: true }));
  const set = await json(app.base + "/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "ollama", ollamaUrl: model.base }) });
  assert.equal(set.status, 200);
  const ingest = (body) => post(app.base + "/api/ingest", body);
  const tracked = async () => (await json(app.base + "/api/state")).body.jobs;
  return { app, site, jobs, llm, ingest, tracked, link: (p) => `${jobs.base}${p}` };
}

test("a page with JobPosting data is saved from that data, without a model call", async () => {
  const w = await world();
  w.site.pages["/p/1"] = page("<h1>Senior Node.js Engineer</h1><p>Apply now</p>", ld(posting()));
  const res = await w.ingest({ url: w.link("/p/1") });
  assert.equal(res.status, 200, res.text);
  assert.equal(w.llm.prompts.length, 0);
  const job = res.body;
  assert.equal(job.title, "Senior Node.js Engineer");
  assert.equal(job.company, "Acme Systems");
  assert.equal(job.location, "Remote (Spain, Portugal)");
  assert.equal(job.remote, true);
  assert.equal(job.workMode, "remote");
  assert.equal(job.salary, "55000-70000 EUR/year");
  assert.equal(job.lang, "en");
  assert.deepEqual(job.tags, ["Node.js", "PostgreSQL", "Docker"]);
  assert.equal(job.description, "Build the platform that runs our API.\n- Node.js\n- PostgreSQL");
  assert.equal(job.postedAt, "2026-09-20T00:00:00.000Z");
  assert.equal(job.url, w.link("/p/1"));
  assert.equal(job.source, "127.0.0.1");
  assert.equal(job.status, "inbox");
  assert.equal((await w.tracked()).length, 1);
});

test("JobPosting data inside @graph, with a trailing comma, a city address and plain-text description is still read", async () => {
  const w = await world();
  const graph = `{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Jobs"},{"@type":["JobPosting"],"title":"Diseñadora UX","description":"Diseñarás flujos para nuestra app de banca móvil con el equipo de producto.","hiringOrganization":"Banco Norte","jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Madrid","addressRegion":"Madrid","addressCountry":"ES"}}],"baseSalary":{"currency":"EUR","value":42000},},]}`;
  w.site.pages["/p/2"] = page("<h1>x</h1>", ld(graph)).replace("<html lang=\"en\">", "<html lang=\"es\">");
  const res = await w.ingest({ url: w.link("/p/2") });
  assert.equal(res.status, 200, res.text);
  assert.equal(w.llm.prompts.length, 0);
  assert.equal(res.body.title, "Diseñadora UX");
  assert.equal(res.body.company, "Banco Norte");
  assert.equal(res.body.location, "Madrid, Madrid, ES");
  assert.equal(res.body.remote, null);
  assert.equal(res.body.salary, "42000 EUR");
  assert.equal(res.body.lang, "es");
});

test("without usable JobPosting data the page text goes to the model, minus menus, footers and scripts", async () => {
  const w = await world();
  w.site.pages["/p/3"] = page(`<nav>Home Jobs Login SECRETNAV</nav><script>var tracker="SECRETSCRIPT"</script>
    <main><h1>Backend developer</h1><p>${"We are hiring a backend developer to work on payments. ".repeat(4)}</p></main><footer>Cookies SECRETFOOTER</footer>`);
  const res = await w.ingest({ url: w.link("/p/3") });
  assert.equal(res.status, 200, res.text);
  assert.equal(w.llm.prompts.length, 1);
  assert.match(w.llm.prompts[0], /Backend developer/);
  assert.doesNotMatch(w.llm.prompts[0], /SECRETSCRIPT|SECRETNAV|SECRETFOOTER/);
  assert.match(w.llm.prompts[0], new RegExp(`URL de origen: ${w.link("/p/3").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
  assert.equal(res.body.title, "From the model");
  assert.equal(res.body.url, w.link("/p/3"));
});

test("a JobPosting without a title or with a one-line description falls back to the model", async () => {
  const w = await world();
  w.site.pages["/p/4"] = page(`<main><h1>Open role</h1><p>${"Join us to build things. ".repeat(10)}</p></main>`, ld(posting({ description: "Short." })));
  w.site.pages["/p/5"] = page(`<main><h1>Open role</h1><p>${"Join us to build more things. ".repeat(10)}</p></main>`, ld(posting({ title: "" })));
  assert.equal((await w.ingest({ url: w.link("/p/4") })).status, 200);
  assert.equal((await w.ingest({ url: w.link("/p/5") })).status, 200);
  assert.equal(w.llm.prompts.length, 2);
});

test("a page that lists several postings gives the one whose url is the page's, and the model decides when none is", async () => {
  const w = await world();
  const a = posting({ title: "Role A", url: w.link("/p/6"), identifier: "a" });
  const b = posting({ title: "Role B", url: w.link("/p/other"), identifier: "b" });
  w.site.pages["/p/6"] = page("<h1>Role A</h1>", ld([b, a]));
  w.site.pages["/p/7"] = page(`<main><p>${"Several openings are listed on this page for you. ".repeat(6)}</p></main>`, ld([a, b]));
  const first = await w.ingest({ url: w.link("/p/6") });
  assert.equal(first.body.title, "Role A");
  assert.equal(w.llm.prompts.length, 0);
  const second = await w.ingest({ url: w.link("/p/7") });
  assert.equal(second.status, 200);
  assert.equal(w.llm.prompts.length, 1);
});

test("a link already in the tracker (tracking parameters and all) is returned without downloading or asking the model", async () => {
  const w = await world();
  w.site.pages["/p/8"] = page("<h1>x</h1>", ld(posting()));
  const first = await w.ingest({ url: w.link("/p/8?utm_source=newsletter") });
  assert.equal(first.status, 200);
  const hits = w.site.hits.length;
  const again = await w.ingest({ url: w.link("/p/8?ref=feed#apply") });
  assert.equal(again.body.id, first.body.id);
  assert.equal(w.site.hits.length, hits, "no second download");
  assert.equal(w.llm.prompts.length, 0);
  assert.equal((await w.tracked()).length, 1);
});

test("pasted text goes through the model and is marked as pasted; nothing at all is a 400", async () => {
  const w = await world();
  const res = await w.ingest({ text: "Se busca desarrollador/a con experiencia en Node. Remoto." });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.source, "pegado");
  assert.equal(res.body.url, "");
  assert.equal(w.llm.prompts.length, 1);
  assert.match(w.llm.prompts[0], /URL de origen: n\/a/);
  assert.match(w.llm.prompts[0], /desarrollador\/a con experiencia en Node/);
  const none = await w.ingest({});
  assert.equal(none.status, 400);
  assert.equal(none.body.error, "Pega una URL o el texto de la oferta");
  assert.equal((await w.ingest({ text: "   \n " })).status, 400);
  // text together with a link: the text is read, the link names the source and is kept
  const both = await w.ingest({ url: w.link("/never-fetched"), text: "Oferta pegada con su enlace de origen." });
  assert.equal(both.status, 200);
  assert.equal(both.body.source, "127.0.0.1");
  assert.equal(w.site.hits.length, 0);
});

test("a page that cannot be read says why and asks for the text; the model is not asked to invent a posting", async () => {
  const w = await world();
  w.site.pages["/gone"] = (req, res) => { res.statusCode = 403; return "Forbidden"; };
  w.site.pages["/captcha"] = page("<h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue. Verify you are human.</p>");
  w.site.pages["/empty"] = page("<script>app.render()</script>");
  w.site.pages["/huge"] = page(`<p>${"x".repeat(3.4 * 1024 * 1024)}</p>`);
  const forbidden = await w.ingest({ url: w.link("/gone") });
  assert.equal(forbidden.status, 500);
  assert.match(forbidden.body.error, /^No pude descargar la página \(HTTP 403\)\. Copia y pega el texto de la oferta\.$/);
  const missing = await w.ingest({ url: w.link("/nope") });
  assert.match(missing.body.error, /HTTP 404/);
  const captcha = await w.ingest({ url: w.link("/captcha") });
  assert.match(captcha.body.error, /captcha, JavaScript o acceso denegado.*Copia y pega/);
  const empty = await w.ingest({ url: w.link("/empty") });
  assert.match(empty.body.error, /no tiene texto que leer.*Copia y pega/);
  const huge = await w.ingest({ url: w.link("/huge") });
  assert.match(huge.body.error, /demasiado grande.*Copia y pega/);
  assert.equal(w.llm.prompts.length, 0);
  assert.equal((await w.tracked()).length, 0);
});

test("by default only public addresses are opened: loopback, private ranges, cloud metadata and other schemes are refused before any connection", async () => {
  const w = await world({ privateUrls: false });
  w.site.pages["/p/1"] = page("<h1>x</h1>", ld(posting()));
  for (const url of [w.link("/p/1"), "http://localhost/job", "http://[::1]/job", "http://10.0.0.5/job", "http://192.168.1.10/job", "http://169.254.169.254/latest/meta-data/", "http://0.0.0.0:1/job", "file:///etc/passwd", "ftp://example.com/job"]) {
    const res = await w.ingest({ url });
    assert.equal(res.status, 500, `${url}: ${res.text}`);
    assert.match(res.body.error, /No pude descargar|red privada|página web/, url);
    assert.match(res.body.error, /Copia y pega/, url);
  }
  assert.match((await w.ingest({ url: w.link("/p/1") })).body.error, /red privada.*JOBHUNT_ALLOW_PRIVATE_URLS=1/);
  assert.equal(w.site.hits.length, 0, "the job site was never contacted");
  assert.equal((await w.tracked()).length, 0);
  // pasted text is unaffected by the address policy
  assert.equal((await w.ingest({ text: "Una oferta pegada." })).status, 200);
});

test("with the family hub up, public pages are read through the hub's fetcher with a size cap; a page it reports as blocked is not retried locally", async () => {
  const hub = await startFakeHub({
    web: (payload) => {
      if (payload.url.endsWith("/blocked")) return { ok: false, status: 403, blocked: true, block_reason: "cloudflare", error: "blocked", error_kind: "blocked" };
      return { ok: true, status: 200, final_url: payload.url, content_type: "text/html", text: page("<h1>Hub page</h1>", ld(posting({ title: "Read through the hub" }))) };
    },
  });
  cleanup.push(() => hub.stop());
  const w = await world({ privateUrls: false, hub });
  const ok = await w.ingest({ url: "jobs.example.test/p/1?utm_source=x" });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.title, "Read through the hub");
  assert.equal(ok.body.url, "https://jobs.example.test/p/1?utm_source=x");
  assert.equal(ok.body.source, "jobs.example.test");
  assert.equal(hub.state.fetches.length, 1);
  assert.equal(hub.state.fetches[0].url, "https://jobs.example.test/p/1?utm_source=x");
  assert.equal(hub.state.fetches[0].accept, "html");
  assert.equal(hub.state.fetches[0].max_bytes, 3 * 1024 * 1024);
  const blocked = await w.ingest({ url: "https://jobs.example.test/blocked" });
  assert.equal(blocked.status, 500);
  assert.match(blocked.body.error, /bloquea las lecturas automáticas \(cloudflare\)\. Copia y pega/);
  assert.equal(hub.state.fetches.length, 2);
  // the opt-in for private networks never goes through the hub (it only reaches the public internet)
  const lan = await world({ privateUrls: true, hub });
  lan.site.pages["/p/9"] = page("<h1>x</h1>", ld(posting({ title: "Read locally" })));
  const local = await lan.ingest({ url: lan.link("/p/9") });
  assert.equal(local.body.title, "Read locally");
  assert.equal(hub.state.fetches.length, 2);
});
