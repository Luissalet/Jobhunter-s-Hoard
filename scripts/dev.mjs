import { spawn } from "node:child_process";
import path from "node:path";
import { findAvailablePort, validPort } from "../server/hoard-commons/server.js";

const apiPort = await findAvailablePort(validPort(process.env.PORT, 5178), { span: 100 });
const uiPort = await findAvailablePort(validPort(process.env.VITE_PORT, 5173), { span: 100 });
const env = { ...process.env, PORT: String(apiPort), PORT_STRICT: "1", JOBHUNT_API_PORT: String(apiPort) };
const vite = path.resolve("node_modules", "vite", "bin", "vite.js");
const children = [
  spawn(process.execPath, ["--watch", "server/index.js"], { env, stdio: "inherit", windowsHide: true }),
  spawn(process.execPath, [vite, "--port", String(uiPort), "--strictPort"], { env, stdio: "inherit", windowsHide: true }),
];
console.log(`\nJubhunter desarrollo: http://127.0.0.1:${uiPort} (API ${apiPort})\n`);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.once("error", (error) => { console.error(error.message); stop(1); });
  child.once("exit", (code) => { if (!stopping) stop(code || 0); });
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
