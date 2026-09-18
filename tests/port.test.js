import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { findAvailablePort, validPort } from "../server/port.js";

test("falls forward when the preferred port is occupied", async (t) => {
  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  t.after(() => occupied.close());
  const preferred = occupied.address().port;
  const selected = await findAvailablePort(preferred, { attempts: 20 });
  assert.ok(selected > preferred);
});

test("invalid port configuration falls back safely", () => {
  assert.equal(validPort("nope", 5178), 5178);
  assert.equal(validPort("70000", 5178), 5178);
  assert.equal(validPort("5182", 5178), 5182);
});
