import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as store from "./store.js";
import {
  contextSchema,
  addSource,
  editSource,
  buildContext,
  readSource,
  listSourceFiles,
  contextFor,
} from "./context.js";
import {
  previewSheet,
  importSheet,
  prepareApplication,
  saveDraft,
} from "./applications.js";
import { callTool, TOOLS } from "./agent-tools.js";
import { pickSource } from "./source-picker.js";

export function installWorkspaceRoutes(app, port) {
  fs.mkdirSync(store.DATA_DIR, { recursive: true });
  const tokenFile = path.join(store.DATA_DIR, "mcp-token");
  if (!fs.existsSync(tokenFile))
    fs.writeFileSync(tokenFile, crypto.randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  let lastCallAt = null;
  const route = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      next(e);
    }
  };
  app.post(
    "/api/agent/call",
    (req, res, next) => {
      const auth = Buffer.from(req.headers.authorization || ""),
        expected = Buffer.from(`Bearer ${token}`);
      if (
        auth.length !== expected.length ||
        !crypto.timingSafeEqual(auth, expected)
      )
        return res.status(401).json({ error: "Conexión MCP no autorizada." });
      next();
    },
    route(async (req) => {
      const result = await callTool(req.body?.name, req.body?.arguments);
      lastCallAt = new Date().toISOString();
      return result;
    }),
  );
  app.get(
    "/api/agent/config",
    route(() => ({
      config: {
        mcpServers: {
          "jubhunters-hoard": {
            command: process.execPath,
            args: [
              path.join(path.dirname(fileURLToPath(import.meta.url)), "mcp.js"),
            ],
            env: {
              JOBHUNT_URL: `http://127.0.0.1:${port}`,
              JOBHUNT_TOKEN_FILE: tokenFile,
            },
          },
        },
      },
      toolCount: TOOLS.length,
      lastCallAt,
      transport: "stdio",
      requiresRunningApp: true,
    })),
  );
  app.post(
    "/api/sources/pick",
    route((req) => {
      const { kind } = z.object({ kind: z.enum(["file", "folder"]) }).parse(req.body);
      return pickSource(kind);
    }),
  );
  app.post(
    "/api/contexts",
    route((req) => store.saveContext(contextSchema.parse(req.body))),
  );
  app.put(
    "/api/contexts/:id",
    route((req) => {
      const data = contextSchema.parse({ ...req.body, id: req.params.id });
      // Context edits invalidate pending approvals, never active attempts.
      for (const job of store
        .listJobs()
        .filter(
          (j) => j.contextId === data.id && j.application?.approvedDraftAt,
        ))
        store.updateJob(job.id, {
          application: { ...job.application, approvedDraftAt: null },
        });
      return store.saveContext(data);
    }),
  );
  app.post(
    "/api/contexts/:id/activate",
    route((req) => ({ activeContextId: store.selectContext(req.params.id) })),
  );
  app.get(
    "/api/contexts/:id/preview",
    route((req) => buildContext(req.params.id)),
  );
  app.post(
    "/api/contexts/:id/sources",
    route((req) => addSource(req.params.id, req.body)),
  );
  app.patch(
    "/api/contexts/:id/sources/:sourceId",
    route((req) => editSource(req.params.id, req.params.sourceId, req.body)),
  );
  app.delete(
    "/api/contexts/:id/sources/:sourceId",
    route((req) => editSource(req.params.id, req.params.sourceId, null)),
  );
  app.get(
    "/api/contexts/:id/sources/:sourceId/files",
    route((req) => listSourceFiles(req.params.id, req.params.sourceId)),
  );
  app.get(
    "/api/contexts/:id/sources/:sourceId/read",
    route((req) =>
      readSource(
        req.params.id,
        req.params.sourceId,
        String(req.query.file || ""),
      ),
    ),
  );
  app.post(
    "/api/sheet/preview",
    route((req) => {
      const a = z
        .object({ text: z.string().max(2000000), contextId: z.string() })
        .parse(req.body);
      return previewSheet(a.text, a.contextId);
    }),
  );
  app.post(
    "/api/sheet/import",
    route((req) => {
      const a = z
        .object({ text: z.string().max(2000000), contextId: z.string() })
        .parse(req.body);
      return importSheet(a.text, a.contextId);
    }),
  );
  app.get(
    "/api/jobs/:id/application",
    route((req) => prepareApplication(req.params.id)),
  );
  app.put(
    "/api/jobs/:id/draft",
    route((req) => saveDraft(req.params.id, req.body)),
  );
  app.post(
    "/api/jobs/:id/approve",
    route((req) => {
      const job = store.getJob(req.params.id);
      if (!job?.application?.draft) throw Error("Guarda primero el borrador.");
      if (job.application.draft.missing?.length)
        throw Error("Resuelve las respuestas pendientes antes de aprobar.");
      contextFor(job.contextId);
      return store.updateJob(job.id, {
        application: {
          ...job.application,
          approvedDraftAt: job.application.draft.savedAt,
        },
      });
    }),
  );
}
