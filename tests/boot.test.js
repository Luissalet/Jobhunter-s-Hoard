// The server process as a whole: request guard, token, port search, shutdown, error envelope and the MCP bridge's default address.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startServer, json, post, root, scratch } from "./helpers.js";

/** One request with a Host header of our choosing (fetch would not let a test lie about it reliably). */
function raw(base, pathname, { host, headers = {}, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, base), { method, headers: { ...(host ? { host } : {}), ...headers } }, (res) => {
      let text = "";
      res.on("data", (b) => (text += b));
      res.on("end", () => resolve({ status: res.statusCode, text, body: (() => { try { return JSON.parse(text); } catch { return null; } })() }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the guard refuses foreign hosts, origins and cross-site requests, and JOBHUNT_ALLOWED_HOSTS widens the host list", async (t) => {
  const app = await startServer();
  t.after(() => app.stop());
  assert.equal((await raw(app.base, "/api/health")).status, 200);
  assert.equal((await raw(app.base, "/api/health", { host: `[::1]:${app.port}` })).status, 200);
  const foreign = await raw(app.base, "/api/state", { host: "evil.example" });
  assert.equal(foreign.status, 403);
  assert.ok(foreign.body.error);
  assert.equal((await raw(app.base, "/api/state", { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await raw(app.base, "/api/state", { headers: { origin: app.base } })).status, 200);
  assert.equal((await raw(app.base, "/api/state", { headers: { origin: "http://localhost:5173" } })).status, 200);
  assert.equal((await raw(app.base, "/api/state", { headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" } })).status, 403);
  // an HTML form posted from another site is a navigation: refused for anything but GET
  assert.equal((await raw(app.base, "/api/jobs", { method: "POST", headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "content-type": "application/json" } })).status, 403);

  const lan = await startServer({ env: { JOBHUNT_ALLOWED_HOSTS: "hoard.lan" } });
  t.after(() => lan.stop());
  assert.equal((await raw(lan.base, "/api/health", { host: `hoard.lan:${lan.port}` })).status, 200);
  assert.equal((await raw(lan.base, "/api/health", { host: "other.lan" })).status, 403);
});

test("the token is created once, kept across restarts and required on /api/agent/call", async (t) => {
  const data = await scratch();
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  const first = await startServer({ data });
  const token = (await fs.readFile(path.join(data, "mcp-token"), "utf8")).trim();
  assert.ok(token.length >= 32);
  const ask = (base, headers = {}) => post(base + "/api/agent/call", { name: "list_contexts", arguments: {} }, headers);
  const none = await ask(first.base);
  assert.equal(none.status, 401);
  assert.equal(none.body.code, "unauthorized");
  assert.equal((await ask(first.base, { Authorization: "Bearer nope" })).status, 401);
  const ok = await ask(first.base, { Authorization: `Bearer ${token}` });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.contexts));
  await first.stop();

  const second = await startServer({ data });
  t.after(() => second.stop());
  assert.equal((await fs.readFile(path.join(data, "mcp-token"), "utf8")).trim(), token);
  assert.equal((await ask(second.base, { Authorization: `Bearer ${token}` })).status, 200);
});

test("an old 64-character hex token keeps working", async (t) => {
  const data = await scratch();
  t.after(() => fs.rm(data, { recursive: true, force: true }));
  const legacy = "ab".repeat(32);
  await fs.writeFile(path.join(data, "mcp-token"), legacy);
  const app = await startServer({ data });
  t.after(() => app.stop());
  const res = await post(app.base + "/api/agent/call", { name: "list_contexts", arguments: {} }, { Authorization: `Bearer ${legacy}` });
  assert.equal(res.status, 200);
});

test("a tool that refuses answers 400 with its own sentence, an unknown tool 404, a bad argument 400 with the field", async (t) => {
  const app = await startServer();
  t.after(() => app.stop());
  const auth = { Authorization: `Bearer ${(await fs.readFile(path.join(app.data, "mcp-token"), "utf8")).trim()}` };
  const missing = await post(app.base + "/api/agent/call", { name: "get_application", arguments: { jobId: "nope" } }, auth);
  assert.equal(missing.status, 400);
  assert.ok(missing.body.error && !/^Internal error/.test(missing.body.error), missing.text);
  const unknown = await post(app.base + "/api/agent/call", { name: "no_such_tool", arguments: {} }, auth);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, "unknown_tool");
  const bad = await post(app.base + "/api/agent/call", { name: "get_application", arguments: {} }, auth);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "invalid_arguments");
  assert.match(bad.body.error, /jobId/);
});

test("routes keep answering 400 with the message, unknown API paths are a JSON 404 and a broken body a JSON 400", async (t) => {
  const app = await startServer();
  t.after(() => app.stop());
  const approve = await post(app.base + "/api/jobs/missing/approve", {});
  assert.equal(approve.status, 400);
  assert.equal(approve.body.error, "Guarda primero el borrador.");
  const nowhere = await json(app.base + "/api/nowhere");
  assert.equal(nowhere.status, 404);
  assert.equal(nowhere.body.code, "not_found");
  const broken = await json(app.base + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nope" });
  assert.equal(broken.status, 400);
  assert.equal(broken.body.code, "invalid_json");
  const huge = await json(app.base + "/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "a".repeat(5.5 * 1024 * 1024) }) });
  assert.equal(huge.status, 413);
});

test("with the preferred port taken the server moves up and says so; PORT_STRICT refuses to", async (t) => {
  const taken = net.createServer();
  await new Promise((resolve) => taken.listen(0, "127.0.0.1", resolve));
  t.after(() => taken.close());
  const preferred = taken.address().port;
  const app = await startServer({ port: preferred });
  t.after(() => app.stop());
  assert.ok(app.port > preferred);
  assert.match(app.output().out, new RegExp(`Puerto ${preferred} ocupado; usando ${app.port}`));
  assert.equal((await json(app.base + "/api/health")).body.service, "jubhunters-hoard");

  await assert.rejects(() => startServer({ port: preferred, env: { PORT_STRICT: "1" } }), /No se pudo iniciar|exited/);
});

test("SIGTERM closes the server and exits 0", { skip: process.platform === "win32" && "signals are not delivered on Windows" }, async (t) => {
  const app = await startServer();
  t.after(() => app.stop());
  app.child.kill("SIGTERM");
  const { code } = await app.exited;
  assert.equal(code, 0);
  await assert.rejects(() => fetch(app.base + "/api/health"));
});

test("the MCP bridge defaults to the app's own port (PORT), not a made-up one", async (t) => {
  const app = await startServer();
  t.after(() => app.stop());
  const env = { ...process.env, PORT: String(app.port), JOBHUNT_DATA_DIR: app.data };
  delete env.JOBHUNT_URL;
  delete env.JOBHUNT_TOKEN_FILE;
  const client = new Client({ name: "boot-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, "server/mcp.js")], env, stderr: "pipe" }));
  try {
    const out = await client.callTool({ name: "list_contexts", arguments: {} });
    assert.equal(out.isError, undefined, JSON.stringify(out));
    assert.ok(Array.isArray(JSON.parse(out.content[0].text).contexts));
  } finally {
    await client.close();
  }
  // and with the app closed it says so in plain words
  await app.stop();
  const closed = new Client({ name: "boot-test-2", version: "1" });
  await closed.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, "server/mcp.js")], env, stderr: "pipe" }));
  try {
    const out = await closed.callTool({ name: "list_contexts", arguments: {} });
    assert.equal(out.isError, true);
    assert.match(JSON.parse(out.content[0].text).error, /Abre Jubhunter's Hoard/);
  } finally {
    await closed.close();
  }
});
