// MCP stdio bridge. A single writer owns the JSON store, so this process never opens it: every call is proxied to the running app
// (POST /api/agent/call) with the token from <data dir>/mcp-token. The proxying, the per-call timeout, the heartbeat for long calls,
// the "app is closed" message and the outcome_unknown answer for a change that may have been applied are createBridge of
// hoard-commons/express.js.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOLS, AGENT_INSTRUCTIONS } from "./agent-tools.js";
import { createBridge } from "./hoard-commons/express.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { version } = createRequire(import.meta.url)("../package.json");
// The app listens on 5178 unless PORT says otherwise (this bridge used to default to 5179, a port nothing listens on).
const base = process.env.JOBHUNT_URL || `http://127.0.0.1:${process.env.PORT || 5178}`;
const tokenFile = process.env.JOBHUNT_TOKEN_FILE
  || path.join(process.env.JOBHUNT_DATA_DIR || path.join(root, "data"), "mcp-token");

const bridge = createBridge({
  app: "jobhunter", service: "jubhunters-hoard", version, McpServer, StdioServerTransport,
  tools: TOOLS, instructions: AGENT_INSTRUCTIONS, baseUrl: base, token: process.env.JOBHUNT_TOKEN || "", tokenFile,
  messages: {
    title: "Jubhunter's Hoard",
    offline: "Abre Jubhunter's Hoard (npm start) para acceder a tus datos.",
    noToken: `Jubhunter's Hoard está abierto, pero este puente no tiene su token (${tokenFile}).`,
    tokenRefused: `Jubhunter's Hoard rechazó el token de este puente (${tokenFile}): es de otra carpeta de datos.`,
    outcomeUnknown: "No llegó respuesta. Puede que el cambio se haya aplicado: consulta el estado actual antes de repetirlo.",
  },
});
await bridge.start();
