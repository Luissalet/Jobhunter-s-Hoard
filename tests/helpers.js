// Test helpers: a real server process on a free port with its own data folder (and, when asked, a stand-in for the Hoard Link hub).
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { freePort } from "../server/hoard-commons/server.js";

export const root = path.resolve(import.meta.dirname, "..");
export const scratch = (prefix = "jobhunt-test-") => fs.mkdtemp(path.join(os.tmpdir(), prefix));

/** Start server/index.js; resolves { base, port, data, child, output(), stop() } once it printed its first line. */
export async function startServer({ env = {}, port = null, data = null } = {}) {
  const dir = data || (await scratch());
  const chosen = port || (await freePort());
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    // A hub that is not there: nothing in these tests may reach a real one on the machine running them.
    env: { ...process.env, HOARD_HUB_URL: "http://127.0.0.1:9", JOBHUNT_DATA_DIR: dir, PORT: String(chosen), ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(err || out || "Startup timeout")), 15000);
    child.once("error", reject);
    // the "listening" line is the last one printed at start (a port that moved prints its own line first)
    const onData = () => {
      if (!/server en http/.test(out)) return;
      child.stdout.off("data", onData);
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve();
    };
    const onExit = (code) => reject(Error(`exited ${code}: ${err || out}`));
    child.once("exit", onExit);
    child.stdout.on("data", onData);
  });
  const live = Number(/127\.0\.0\.1:(\d+)/.exec(out)?.[1]) || chosen;
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  return {
    base: `http://127.0.0.1:${live}`,
    port: live,
    data: dir,
    child,
    exited,
    output: () => ({ out, err }),
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
    },
  };
}

/** A local HTTP server answering `handler(req, res)`; resolves { base, close() }. */
export async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    server,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

export const json = async (url, init = {}) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, text, headers: res.headers };
};

export const post = (url, body, headers = {}) =>
  json(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

/** A one-page PDF whose text layer is `text` (pass "" for a page without any). */
export function makePdf(text) {
  const stream = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
