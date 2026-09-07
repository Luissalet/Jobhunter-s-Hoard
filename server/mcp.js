// A single writer owns the JSON store: MCP clients proxy to the running application.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOLS, AGENT_INSTRUCTIONS } from "./agent-tools.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.env.JOBHUNT_URL || "http://127.0.0.1:5178";
const parsed = new URL(base);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
  parsed.protocol !== "http:"
)
  throw Error("El puente MCP solo se conecta al servidor local.");
const tokenFile =
  process.env.JOBHUNT_TOKEN_FILE ||
  path.join(
    process.env.JOBHUNT_DATA_DIR || path.join(root, "data"),
    "mcp-token",
  );
const server = new McpServer(
  { name: "jubhunters-hoard", version: "0.2.0" },
  { instructions: AGENT_INSTRUCTIONS },
);
for (const tool of TOOLS)
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (args) => {
      try {
        const token =
          process.env.JOBHUNT_TOKEN ||
          fs.readFileSync(tokenFile, "utf8").trim();
        const response = await fetch(new URL("/api/agent/call", base), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: tool.name, arguments: args }),
          signal: AbortSignal.timeout(90000),
        });
        const body = await response.json();
        if (!response.ok) throw Error(body.error || `Error ${response.status}`);
        return { content: [{ type: "text", text: JSON.stringify(body) }] };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error:
                  e.code === "ENOENT" || e.message === "fetch failed"
                    ? "Abre Jubhunter's Hoard (npm start) para acceder a tus datos."
                    : e.message,
              }),
            },
          ],
        };
      }
    },
  );
await server.connect(new StdioServerTransport());
