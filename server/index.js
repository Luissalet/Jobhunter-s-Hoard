import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import { searchAll, SOURCE_INFO, stripHtml } from "./sources.js";
import {
  llmJson,
  extractPrompt,
  scorePrompt,
  tailorPrompt,
  followupPrompt,
  prepPrompt,
} from "./llm.js";
import { renderDocPage } from "./render.js";
import { installWorkspaceRoutes } from "./workspace-routes.js";
import { contextPrompt, CONTEXT_RULES } from "./context.js";
import { captureJob } from "./applications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use((req, res, next) => {
  const host = (req.headers.host || "").split(":")[0];
  if (!["localhost", "127.0.0.1"].includes(host))
    return res.status(403).json({ error: "Solo se permite acceso local." });
  const origin = req.headers.origin;
  if (origin) {
    const allowed = [
      `http://${req.headers.host}`,
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ];
    if (!allowed.includes(origin))
      return res.status(403).json({ error: "Origen no permitido." });
  }
  if (req.headers["sec-fetch-site"] === "cross-site")
    return res
      .status(403)
      .json({ error: "Petición desde otra web no permitida." });
  next();
});
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 5178;
installWorkspaceRoutes(app, PORT);

// ---------- Estado ----------
app.get("/api/state", (req, res) => {
  res.json({
    jobs: store.listJobs(),
    settings: store.getSettings(),
    profile: store.getProfile(),
    sources: SOURCE_INFO,
    contexts: store.listContexts(),
    activeContextId: store.activeContextId(),
  });
});

// ---------- Jobs CRUD ----------
app.post("/api/jobs", (req, res) => {
  res.json(captureJob(req.body || {}).job);
});

app.post("/api/jobs/import", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  let added = 0,
    skipped = 0;
  const jobs = [];
  for (const item of items) {
    if (store.jobExists(item)) {
      skipped++;
      continue;
    }
    jobs.push(store.addJob(item));
    added++;
  }
  res.json({ added, skipped, jobs });
});

app.patch("/api/jobs/:id", (req, res) => {
  const job = store.updateJob(req.params.id, req.body || {});
  if (!job) return res.status(404).json({ error: "No existe" });
  res.json(job);
});

app.delete("/api/jobs/:id", (req, res) => {
  res.json({ ok: store.deleteJob(req.params.id) });
});

// ---------- Búsqueda en fuentes ----------
app.post("/api/search", async (req, res) => {
  try {
    const { query = "", location = "", sources = [] } = req.body || {};
    if (!query.trim())
      return res.status(400).json({ error: "Pon algo que buscar" });
    const out = await searchAll({ query, location, sources });
    // marca las que ya están en el tracker
    out.results = out.results.map((r) => ({
      ...r,
      alreadyTracked: store.jobExists(r),
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Ingesta manual (URL o texto pegado) ----------
app.post("/api/ingest", async (req, res) => {
  try {
    const { url = "", text = "" } = req.body || {};
    let raw = text;
    if (!raw && url) {
      const r = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok)
        throw new Error(
          `No pude descargar la página (HTTP ${r.status}). Copia y pega el texto de la oferta.`,
        );
      raw = stripHtml(await r.text());
    }
    if (!raw?.trim())
      return res
        .status(400)
        .json({ error: "Pega una URL o el texto de la oferta" });

    const extracted = await llmJson(extractPrompt(raw, url), {
      temperature: 0.2,
    });
    const job = store.addJob({
      ...extracted,
      url: url || extracted.applyUrl || "",
      source: url ? new URL(url).hostname.replace("www.", "") : "pegado",
    });
    res.json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Scoring ----------
app.post("/api/jobs/:id/score", async (req, res) => {
  try {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "No existe" });
    const profile = await contextPrompt(job.contextId);
    if (!profile.trim())
      return res
        .status(400)
        .json({ error: "Tu perfil está vacío. Rellénalo en Ajustes." });
    const details = await llmJson(scorePrompt(profile, job), {
      temperature: 0.3,
    });
    const updated = store.updateJob(job.id, {
      score: Math.max(0, Math.min(100, Number(details.score) || 0)),
      scoreDetails: details,
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Tailoring (CV + carta) ----------
app.post("/api/jobs/:id/tailor", async (req, res) => {
  try {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "No existe" });
    const profile = await contextPrompt(job.contextId);
    if (!profile.trim())
      return res
        .status(400)
        .json({ error: "Tu perfil está vacío. Rellénalo en Ajustes." });
    const lang = req.body?.lang || job.lang || "es";
    const { personal } = store.getSettings();
    const out = await llmJson(tailorPrompt(profile, job, personal, lang), {
      temperature: 0.5,
    });
    if (!out.cvMarkdown)
      throw new Error("El LLM no devolvió el CV. Reintenta.");
    const patch = {
      tailored: {
        cvMarkdown: out.cvMarkdown,
        letterMarkdown: out.letterMarkdown || "",
        lang,
        generatedAt: new Date().toISOString(),
      },
    };
    if (job.status === "inbox" || job.status === "interested")
      patch.status = "tailored";
    res.json(store.updateJob(job.id, patch));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Follow-up email ----------
app.post("/api/jobs/:id/followup", async (req, res) => {
  try {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "No existe" });
    const profile = await contextPrompt(job.contextId);
    const lang = req.body?.lang || job.lang || "es";
    const { personal } = store.getSettings();
    const out = await llmJson(followupPrompt(profile, job, personal, lang), {
      temperature: 0.5,
    });
    if (!out.body) throw new Error("El LLM no devolvió el email. Reintenta.");
    res.json(
      store.updateJob(job.id, {
        followup: { ...out, lang, generatedAt: new Date().toISOString() },
      }),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Preparación de entrevista ----------
app.post("/api/jobs/:id/prep", async (req, res) => {
  try {
    const job = store.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "No existe" });
    const profile = await contextPrompt(job.contextId);
    if (!profile.trim())
      return res
        .status(400)
        .json({ error: "Tu perfil está vacío. Rellénalo en Ajustes." });
    const lang = req.body?.lang || job.lang || "es";
    const out = await llmJson(prepPrompt(profile, job, lang), {
      temperature: 0.5,
    });
    if (!out.questions?.length)
      throw new Error("El LLM no devolvió preguntas. Reintenta.");
    res.json(
      store.updateJob(job.id, {
        interviewPrep: { ...out, lang, generatedAt: new Date().toISOString() },
      }),
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/jobs/:id/prep.html", (req, res) => {
  const job = store.getJob(req.params.id);
  const p = job?.interviewPrep;
  if (!p)
    return res.status(404).send("Genera primero la preparación de entrevista.");
  const md = [
    `# Preparación de entrevista — ${job.title} · ${job.company}`,
    "\n## Preguntas probables\n",
    ...(p.questions || []).map((x) => `**${x.q}**\n\n${x.a}\n`),
    "\n## Preguntas incómodas y cómo manejarlas\n",
    ...(p.tough || []).map((x) => `**${x.q}**\n\n${x.a}\n`),
    "\n## Preguntas para el entrevistador\n",
    ...(p.forInterviewer || []).map((q) => `- ${q}`),
    "\n## Consejos\n",
    ...(p.tips || []).map((t) => `- ${t}`),
  ].join("\n");
  res.send(
    renderDocPage({
      title: `Prep — ${job.company || job.title}`,
      subtitle: job.title,
      markdown: md,
    }),
  );
});

// ---------- Backup / restore ----------
app.get("/api/backup", (req, res) => {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="jubhunters-hoard-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.json(store.exportAll());
});

app.post("/api/restore", (req, res) => {
  try {
    res.json(store.importAll(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Documentos imprimibles ----------
app.get("/api/jobs/:id/cv.html", (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job?.tailored?.cvMarkdown)
    return res.status(404).send("Genera primero el CV para esta oferta.");
  res.send(
    renderDocPage({
      title: `CV — ${job.company || job.title}`,
      subtitle: job.title,
      markdown: job.tailored.cvMarkdown,
    }),
  );
});

app.get("/api/jobs/:id/letter.html", (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job?.tailored?.letterMarkdown)
    return res.status(404).send("Genera primero la carta para esta oferta.");
  res.send(
    renderDocPage({
      title: `Carta — ${job.company || job.title}`,
      subtitle: job.title,
      markdown: job.tailored.letterMarkdown,
    }),
  );
});

// ---------- Perfil y ajustes ----------
app.put("/api/profile", (req, res) => {
  if (
    typeof req.body?.markdown !== "string" ||
    req.body.markdown.length > 100000
  )
    return res
      .status(400)
      .json({ error: "El perfil debe ser texto de hasta 100.000 caracteres." });
  store.setProfile(req.body?.markdown ?? "");
  store.invalidateApprovals();
  res.json({ ok: true });
});

app.put("/api/settings", (req, res) => {
  if (req.body?.personal) store.invalidateApprovals();
  res.json(store.updateSettings(req.body || {}));
});

// ---------- Export CSV ----------
app.get("/api/export.csv", (req, res) => {
  const rows = [
    [
      "Fecha alta",
      "Puesto",
      "Empresa",
      "Ubicación",
      "Estado",
      "Aplicada",
      "Score",
      "URL",
      "Fuente",
      "Notas",
      "Tipo",
      "Contexto",
    ],
  ];
  for (const j of store.listJobs()) {
    rows.push([
      j.createdAt?.slice(0, 10),
      j.title,
      j.company,
      j.location,
      j.status,
      j.appliedAt?.slice(0, 10) || "",
      j.score ?? "",
      j.url,
      j.source,
      (j.notes || "").replace(/\n/g, " "),
      { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial" }[
        j.workMode
      ] || "",
      store.getContext(j.contextId)?.name || "",
    ]);
  }
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          let value = String(c ?? "");
          if (/^[\s]*[=+@-]/.test(value)) value = "'" + value;
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="jubhunters-hoard-export.csv"',
  );
  res.send("﻿" + csv);
});

// ---------- Frontend estático (npm run build && npm start) ----------
const DIST = path.join(__dirname, "..", "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api).*/, (req, res) =>
    res.sendFile(path.join(DIST, "index.html")),
  );
}

app.use((err, req, res, next) => {
  res
    .status(400)
    .json({
      error: err.issues
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : err.message,
    });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`⚡ Jubhunter's Hoard server en http://localhost:${PORT}`);
});
