import fs from "node:fs";
import path from "node:path";
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
  recordEmployerResponse,
} from "./applications.js";
import { callTool, TOOLS, AGENT_INSTRUCTIONS } from "./agent-tools.js";
import * as family from "./hoard-link.js";
import { makeAgentRoutes } from "./hoard-commons/express.js";
import { readOrCreateToken } from "./hoard-commons/server.js";
import {
  rememberAnswer,
  listAnswers,
  updateAnswer,
  deleteAnswer,
  mergeAnswers,
  recoverHistoricalAnswers,
  ConflictError,
} from "./answer-library.js";
import { extractFromFiles } from "./answer-recovery.js";
import { pickSource } from "./source-picker.js";

export function installWorkspaceRoutes(app, port) {
  fs.mkdirSync(store.DATA_DIR, { recursive: true });
  const tokenFile = path.join(store.DATA_DIR, "mcp-token");
  // The token is created once and kept: a bridge that is already running keeps working across restarts of the app.
  const token = readOrCreateToken(tokenFile);
  // The Hoard family: events on the hub's bus (agent.call per call) and the
  // hoard_link block in /api/health; the token above is this app's voice there.
  family.configure({ app: "jobhunter", dataDir: store.DATA_DIR, tokenFile });
  let lastCallAt = null;
  const route = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      next(e);
    }
  };
  // The family's two agent routes (catalogue and call, Bearer token, result cap, error envelope, agent.call audit event).
  makeAgentRoutes({
    app: "jobhunter",
    tools: TOOLS,
    callTool,
    z,
    token,
    instructions: AGENT_INSTRUCTIONS,
    capLimit: 500_000,
    recordCall(tool, ok, ms, details) {
      if (ok) lastCallAt = new Date().toISOString();
      family.recordCall(tool, ok, ms, details);
    },
  }).install(app);
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
  // Reemplazo completo del contexto, salvo `answers`: si el body no trae
  // `answers`, no se toca (evita el bug de sobrescritura ciega). Si lo
  // trae, se fusiona por id (edita existentes, nunca borra los ausentes;
  // el borrado real es solo por DELETE /answers/:answerId) y las entradas
  // sin id se añaden con la misma deduplicación que remember_answer.
  app.put(
    "/api/contexts/:id",
    route((req) => {
      const hadAnswers = Object.prototype.hasOwnProperty.call(
        req.body || {},
        "answers",
      );
      const data = contextSchema.parse({ ...req.body, id: req.params.id });
      if (hadAnswers) data.answers = mergeAnswers(req.params.id, data.answers);
      else delete data.answers;
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
  app.get(
    "/api/contexts/:id/answers",
    route((req) => listAnswers(req.params.id)),
  );
  app.post("/api/contexts/:id/answers", (req, res, next) => {
    try {
      const result = rememberAnswer(req.params.id, req.body?.entry);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });
  app.patch("/api/contexts/:id/answers/:answerId", (req, res, next) => {
    try {
      const answer = updateAnswer(
        req.params.id,
        req.params.answerId,
        req.body || {},
      );
      res.json({ answer });
    } catch (e) {
      if (e instanceof ConflictError)
        return res.status(409).json({ conflict: true, current: e.current });
      next(e);
    }
  });
  app.delete("/api/contexts/:id/answers/:answerId", (req, res, next) => {
    try {
      deleteAnswer(req.params.id, req.params.answerId);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/contexts/:id/answers/recover",
    route((req) =>
      recoverHistoricalAnswers({
        contextId: req.params.id,
        force: req.query.force === "1",
      }),
    ),
  );
  app.post(
    "/api/answers/recover",
    route((req) => recoverHistoricalAnswers({ force: req.query.force === "1" })),
  );
  app.post(
    "/api/answers/recover-files",
    route((req) => {
      const { dir } = z.object({ dir: z.string().min(1).max(4000) }).parse(
        req.body,
      );
      if (!path.isAbsolute(dir) || dir.split(/[\\/]/).includes(".."))
        throw new Error("Indica una ruta absoluta sin '..'.");
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
        throw new Error("La carpeta no existe.");
      const contextId = req.body?.contextId || store.activeContextId();
      const extraction = extractFromFiles(dir);
      let added = 0,
        skipped = 0;
      for (const candidate of extraction.candidates) {
        const result = rememberAnswer(contextId, {
          question: candidate.question,
          answer: candidate.answer,
          source: candidate.source,
          scope: "application",
          needsReview: true,
        });
        if (result.added) added++;
        else skipped++;
      }
      return {
        filesScanned: extraction.filesScanned,
        candidates: extraction.candidates.length,
        added,
        skipped,
        unparsed: extraction.unparsed,
      };
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
  // Equivalente REST de la herramienta MCP record_employer_response, para
  // que la propia UI pueda registrar un mensaje de la empresa.
  app.post(
    "/api/jobs/:id/responses",
    route((req) => recordEmployerResponse(req.params.id, req.body || {})),
  );
}
