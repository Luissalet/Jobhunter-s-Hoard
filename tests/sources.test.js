// Job-board adapters: the shared polite fetcher underneath, and the fragment-to-text conversion of the descriptions.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OPERATOR_LOCAL } from "../server/hoard-commons/web.js";
import { serve } from "./helpers.js";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jobhunt-sources-"));
process.env.JOBHUNT_DATA_DIR = path.join(temp, "data");
const { getJson, searchAll, stripHtml } = await import("../server/sources.js");
after(() => fs.rm(temp, { recursive: true, force: true }));

test("getJson refuses private addresses by default and says why", async () => {
  const local = await serve((req, res) => res.end("{}"));
  try {
    await assert.rejects(() => getJson(`${local.base}/x`), /private|loopback|local|not allowed|blocked/i);
  } finally { await local.close(); }
});

test("getJson sends the app's user agent, returns the parsed body and turns failures into sentences", async () => {
  const seen = [];
  const api = await serve((req, res) => {
    seen.push({ url: req.url, ua: req.headers["user-agent"], accept: req.headers.accept, custom: req.headers["x-test"] });
    if (req.url === "/ok") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ jobs: [{ id: 1 }] })); }
    if (req.url === "/limited") { res.statusCode = 429; res.setHeader("retry-after", "30"); return res.end("slow down"); }
    if (req.url === "/gone") { res.statusCode = 404; return res.end("no"); }
    if (req.url === "/html") { res.setHeader("content-type", "text/html"); return res.end("<html>hi</html>"); }
    if (req.url === "/moved") { res.statusCode = 302; res.setHeader("location", "/ok"); return res.end(); }
    if (req.url === "/big") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ blob: "x".repeat(13 * 1024 * 1024) })); }
    res.statusCode = 500; res.end();
  });
  try {
    const data = await getJson(`${api.base}/ok`, { profile: OPERATOR_LOCAL, headers: { "X-Test": "1" } });
    assert.deepEqual(data, { jobs: [{ id: 1 }] });
    assert.equal(seen[0].ua, "Mozilla/5.0 (JubhuntersHoard personal tracker)");
    assert.match(seen[0].accept, /json/);
    assert.equal(seen[0].custom, "1");
    await assert.rejects(() => getJson(`${api.base}/limited`, { profile: OPERATOR_LOCAL }), /^Error: HTTP 429 \(reintenta en 30 s\)$/);
    await assert.rejects(() => getJson(`${api.base}/gone`, { profile: OPERATOR_LOCAL }), /^Error: HTTP 404$/);
    await assert.rejects(() => getJson(`${api.base}/html`, { profile: OPERATOR_LOCAL }), /not JSON/i);
    await assert.rejects(() => getJson(`${api.base}/moved`, { profile: OPERATOR_LOCAL }), /HTTP 302/);
    await assert.rejects(() => getJson(`${api.base}/big`, { profile: OPERATOR_LOCAL }), /larger than/);
  } finally { await api.close(); }
});

test("two calls to the same host are at least a second apart", async () => {
  const stamps = [];
  const api = await serve((req, res) => { stamps.push(Date.now()); res.setHeader("content-type", "application/json"); res.end("{}"); });
  try {
    await getJson(`${api.base}/1`, { profile: OPERATOR_LOCAL });
    await getJson(`${api.base}/2`, { profile: OPERATOR_LOCAL });
    assert.ok(stamps[1] - stamps[0] >= 900, `gap was ${stamps[1] - stamps[0]} ms`);
  } finally { await api.close(); }
});

test("stripHtml keeps list items as bullets, decodes entities and drops scripts and styles", () => {
  assert.equal(stripHtml("<p>Hi &amp; welcome</p><ul><li>a</li><li class=x>b <b>bold</b></li></ul><p>end"), "Hi & welcome\n- a\n- b bold\nend");
  assert.equal(stripHtml("<style>.a{}</style><script>var x=1</script><h2>Title</h2><div>Body</div>"), "Title\nBody");
  assert.equal(stripHtml("<ul><li><p>nested</p></li></ul>"), "- nested");
  assert.equal(stripHtml("Acme | Remote<p>We use &#x27;Node&#x27; &gt; 5 years &nbsp;x"), "Acme | Remote\nWe use 'Node' > 5 years x");
  assert.equal(stripHtml(null), "");
  assert.equal(stripHtml(undefined), "");
});

test("each adapter turns its board's answer into the same posting shape", async () => {
  const calls = [];
  const fixtures = (url) => {
    calls.push(url);
    if (url.startsWith("https://remotive.com")) return { jobs: [{ title: "Node dev", company_name: "Acme", candidate_required_location: "Europe", salary: "50k", url: "https://remotive.com/j/1", description: "<ul><li>Node</li></ul>", tags: ["node"], publication_date: "2026-09-01T00:00:00" }] };
    if (url.startsWith("https://www.arbeitnow.com")) return { data: url.endsWith("page=1") ? [{ title: "Node engineer", description: "<p>Berlin</p>", company_name: "Beta", location: "Berlin", remote: true, url: "https://www.arbeitnow.com/j/2", tags: ["node"], created_at: 1788000000 }, { title: "Cook", description: "", company_name: "X", url: "u", tags: [] }] : [] };
    if (url.startsWith("https://remoteok.com")) return [{ legal: "notice" }, { position: "Node lead", company: "Gamma", url: "https://remoteok.com/j/3", description: "<p>Remote</p>", tags: ["node"], date: "2026-09-02", salary_min: 80000, salary_max: 100000 }];
    if (url.startsWith("https://jobicy.com")) return { jobs: [{ jobTitle: "Node SRE", jobExcerpt: "node ops", jobDescription: "<p>Ops</p>", companyName: "Delta", jobGeo: "EU", url: "https://jobicy.com/j/4", jobIndustry: ["DevOps"], jobLevel: "Senior", pubDate: "2026-09-03 10:00:00" }] };
    if (url.startsWith("https://himalayas.app")) return { jobs: [{ title: "Node staff", excerpt: "node", description: "<p>Staff</p>", companyName: "Eps", locationRestrictions: ["Spain"], minSalary: 90000, maxSalary: 110000, currency: "EUR", applicationLink: "https://himalayas.app/j/5", categories: ["backend"], pubDate: 1788000000 }] };
    if (url.includes("search_by_date")) return { hits: [{ title: "Ask HN: Who is hiring? (September 2026)", objectID: "99" }] };
    if (url.includes("tags=comment")) return { hits: [{ comment_text: "Zeta | Remote | Node dev<p>Join &amp; build", objectID: "123", created_at: "2026-09-04T00:00:00Z" }] };
    throw new Error(`unexpected ${url}`);
  };
  const out = await searchAll({ query: "node", location: "", sources: ["remotive", "arbeitnow", "remoteok", "jobicy", "himalayas", "hackernews"] }, { fetchJson: async (url) => fixtures(url) });
  assert.deepEqual(out.errors, []);
  const bySource = Object.fromEntries(out.results.map((r) => [r.source, r]));
  assert.deepEqual(Object.keys(bySource).sort(), ["arbeitnow", "hackernews", "himalayas", "jobicy", "remoteok", "remotive"]);
  assert.equal(bySource.remotive.description, "- Node");
  assert.equal(bySource.arbeitnow.title, "Node engineer");
  assert.equal(out.results.filter((r) => r.source === "arbeitnow").length, 1, "the cook posting does not match the query");
  assert.equal(bySource.remoteok.salary, "$80000-100000");
  assert.equal(bySource.hackernews.company, "Zeta");
  assert.equal(bySource.hackernews.description, "Zeta | Remote | Node dev\nJoin & build");
  assert.equal(bySource.himalayas.location, "Spain");
  for (const r of out.results) for (const key of ["source", "title", "company", "location", "remote", "salary", "url", "description", "tags", "postedAt", "lang"]) assert.ok(key in r, `${r.source} lacks ${key}`);
});

test("a failing board is reported by name and does not hide the others", async () => {
  const out = await searchAll({ query: "node", sources: ["remotive", "jobicy"] }, {
    fetchJson: async (url) => {
      if (url.includes("jobicy")) throw new Error("HTTP 503");
      return { jobs: [{ title: "Node", company_name: "A", url: "https://remotive.com/j/1", description: "" }] };
    },
  });
  assert.equal(out.results.length, 1);
  assert.deepEqual(out.errors, [{ source: "jobicy", error: "HTTP 503" }]);
});
