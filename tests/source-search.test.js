import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { startServer } from "./helpers.js";

test("source-search HTTP shares native matching and validation without changing contexts", async () => {
  const server = await startServer();
  const request = async (url, body) => {
    const response = await fetch(server.base + url, body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.ok, true);
    return response.json();
  };
  try {
    const context = await request("/api/contexts", { name: "Search fixture" });
    await request(`/api/contexts/${context.id}/sources`, { kind: "note", label: "Enabled", content: "EVIDENCE one; evidence two." });
    await request(`/api/contexts/${context.id}/sources`, { kind: "note", label: "Disabled", content: "Evidence hidden", enabled: false });
    const before = await fs.readFile(path.join(server.data, "db.json"));
    const result = await request(`/api/contexts/${context.id}/search?query=%20evidence%20`);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].label, "Enabled");
    assert.equal(result.scanned, 1);
    assert.match(result.notice, /60.*20.000/);
    assert.deepEqual((await request(`/api/contexts/${context.id}/search?query=absent`)).matches, []);
    for (const query of ["x", "", "x".repeat(201)]) {
      const response = await fetch(`${server.base}/api/contexts/${context.id}/search?query=${query}`);
      assert.equal(response.status, 400);
    }
    assert.deepEqual(await fs.readFile(path.join(server.data, "db.json")), before);
  } finally {
    await server.stop();
    await fs.rm(server.data, { recursive: true, force: true });
  }
});
