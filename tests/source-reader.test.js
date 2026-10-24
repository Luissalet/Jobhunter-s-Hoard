import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { startServer } from "./helpers.js";

test("source-read HTTP delegates native cursor validation and reads beyond the preview without changing sources", async () => {
  const server = await startServer({ env: { HOARD_EVENTS: "0", HOARD_COPILOT: "0", HOARD_HUB_AUTOSTART: "0" } });
  const get = async url => { const r = await fetch(server.base + url); assert.equal(r.status, 200); return r.json(); };
  const post = async (url, body) => { const r = await fetch(server.base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); assert.equal(r.ok, true); return r.json(); };
  try {
    const folder = path.join(server.data, "own-text"); await fs.mkdir(folder);
    const content = "Primero ñ 😀\n" + "evidencia propia\n".repeat(2100) + "Última referencia ñ";
    const file = path.join(folder, "trayectoria.txt"); await fs.writeFile(file, content);
    const context = await post("/api/contexts", { name: "Reader fixture" });
    const source = await post(`/api/contexts/${context.id}/sources`, { kind: "folder", label: "Own evidence", path: folder });
    const base = `/api/contexts/${context.id}/sources/${source.id}/read?file=trayectoria.txt`;
    const before = await fs.readFile(path.join(server.data, "db.json"));
    const first = await get(base); assert.equal(first.content, content.slice(0, 12000)); assert.equal(first.nextOffset, 12000);
    const next = await get(`${base}&offset=${first.nextOffset}`); assert.equal(next.offset, 12000); assert.equal(next.content, content.slice(12000, 24000));
    const last = await get(`${base}&offset=${next.nextOffset}`); assert.equal(last.content, content.slice(24000)); assert.equal(last.nextOffset, null); assert.equal(last.totalChars, content.length);
    const unicode = await get(`${base}&offset=8&limit=4000`); assert.equal(unicode.content, content.slice(8, 4008)); assert.equal(unicode.nextOffset, 4008);
    for (const query of ["offset=-1", "offset=1.5", "offset=no", "limit=0", "limit=20001"]) assert.equal((await fetch(`${server.base}${base}&${query}`)).status, 400);
    assert.deepEqual(await fs.readFile(file), Buffer.from(content)); assert.deepEqual(await fs.readFile(path.join(server.data, "db.json")), before);
  } finally { await server.stop(); await fs.rm(server.data, { recursive: true, force: true }); }
});
