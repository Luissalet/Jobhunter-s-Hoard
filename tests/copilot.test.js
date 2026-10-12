// The Faustus copilot relay inside the app: /api/copilot/* routes, the launcher tag in the served page, and the manifest.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { startServer, serve, json, post, root } from "./helpers.js";

const DIST = path.join(root, "dist");
const INDEX = path.join(DIST, "index.html");
const hadIndex = fs.existsSync(INDEX);
let faustus;
let app;
let data;

before(async () => {
  // A stand-in for Faustus: the capabilities probe, the panel script and one chat route.
  faustus = await serve((req, res) => {
    if (req.url === "/api/hoard-copilot/capabilities") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ contract_version: "1" })); }
    if (req.url === "/api/hoard-copilot/panel.js") { res.setHeader("content-type", "application/javascript"); return res.end("export const panel = true;"); }
    res.statusCode = 404;
    return res.end("{}");
  });
  // The server serves the built page only when dist exists at start.
  if (!hadIndex) { fs.mkdirSync(DIST, { recursive: true }); fs.writeFileSync(INDEX, "<!doctype html><html><body><div id=\"root\"></div></body></html>"); }
  app = await startServer({ env: { HOARD_FAUSTUS_URL: faustus.base } });
  data = app.data;
});

after(async () => {
  await app.stop();
  await faustus.close();
  await fsp.rm(data, { recursive: true, force: true });
  if (!hadIndex) fs.rmSync(DIST, { recursive: true, force: true });
});

test("/api/copilot/info names the app and points at the same-origin panel", async () => {
  const { status, body } = await json(`${app.base}/api/copilot/info`);
  assert.equal(status, 200);
  assert.equal(body.app_id, "jobhunter");
  assert.equal(body.panel_url, "/api/copilot/panel.js");
  assert.ok(body.app_name);
  assert.ok(body.data_space_id);
});

test("the panel script is relayed and the launcher is served", async () => {
  const panel = await fetch(`${app.base}/api/copilot/panel.js`);
  assert.equal(panel.status, 200);
  assert.match(await panel.text(), /panel = true/);
  const launcher = await fetch(`${app.base}/api/copilot/launcher.js`);
  assert.equal(launcher.status, 200);
  assert.match(launcher.headers.get("content-type"), /javascript/);
  assert.match(await launcher.text(), /hoardCopilot/);
});

test("the page the app serves carries the launcher tag once", async () => {
  const html = await (await fetch(`${app.base}/`)).text();
  assert.match(html, /<script type="module" src="\/api\/copilot\/launcher\.js"><\/script>/);
  assert.equal((html.match(/launcher\.js/g) || []).length, 1);
});

test("the proxy only relays the copilot's own routes", async () => {
  const bad = await post(`${app.base}/api/copilot/proxy`, { path: "/api/admin/secrets", method: "GET" });
  assert.equal(bad.status, 400);
});

test("the app's own routes keep answering next to the copilot", async () => {
  assert.equal((await json(`${app.base}/api/health`)).body.service, "jubhunters-hoard");
  assert.ok(Array.isArray((await json(`${app.base}/api/state`)).body.jobs));
});

test("the manifest declares the copilot contract and what the context sends", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "faustus-plugin.json"), "utf8"));
  const copilot = manifest["x-family"].copilot;
  assert.equal(copilot.provider, "faustus");
  assert.equal(copilot.contract, "1.0");
  assert.equal(copilot.panel, "/api/copilot/panel.js");
  assert.ok(copilot.context.includes("job") && copilot.context.includes("view.editor") && copilot.context.includes("project"));
  assert.equal(manifest["x-family"].stack, "node");   // the existing declaration is untouched
});