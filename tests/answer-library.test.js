import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import express from "express";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jobhunt-answers-test-"));
process.env.JOBHUNT_DATA_DIR = path.join(temp, "data");
const store = await import("../server/store.js");
const lib = await import("../server/answer-library.js");
const apps = await import("../server/applications.js");
const recovery = await import("../server/answer-recovery.js");
const { installWorkspaceRoutes } = await import("../server/workspace-routes.js");
const root = path.resolve(import.meta.dirname, "..");

after(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

function makeContext(name, preferences = {}) {
  return store.saveContext({ name, preferences });
}

test("exact dedupe ignores accents, ¿?/* and extra spaces", () => {
  const c = makeContext("Dedupe");
  const a = lib.rememberAnswer(c.id, {
    question: "¿Años de experiencia con Docker?",
    answer: "  Tres  años  ",
  });
  assert.equal(a.added, true);
  const b = lib.rememberAnswer(c.id, {
    question: "años   de experiencia con docker",
    answer: "tres años",
  });
  assert.equal(b.added, false);
  assert.equal(b.answer.id, a.answer.id);
});

test("a distinct answer to the same question is kept as a reviewable variant, never overwritten", () => {
  const c = makeContext("Variants");
  const first = lib.rememberAnswer(c.id, {
    question: "¿Experiencia con Docker y Kubernetes?",
    answer: "Docker: 2 años",
  });
  const second = lib.rememberAnswer(c.id, {
    question: "¿Experiencia con Docker y Kubernetes?",
    answer: "Docker+Kubernetes: 0",
  });
  assert.equal(second.added, true);
  assert.notEqual(second.answer.id, first.answer.id);
  assert.equal(second.answer.needsReview, true);
  const { answers } = lib.listAnswers(c.id);
  assert.equal(answers.filter((a) => a.question.includes("Docker")).length, 2);
  assert.equal(answers.find((a) => a.id === first.answer.id).answer, "Docker: 2 años");
});

test("a jobId from another context is rejected", () => {
  const a = makeContext("Owner A"),
    b = makeContext("Owner B");
  const job = apps.captureJob({
    contextId: a.id,
    title: "Role",
    company: "Acme",
    url: "https://example.com/owner-test",
  }).job;
  assert.throws(
    () => lib.rememberAnswer(b.id, { question: "¿Puesto?", answer: "Sí", jobId: job.id }),
    /pertenece/,
  );
});

test("an empty answer is flagged needsReview and answers over 20000 chars are rejected", () => {
  const c = makeContext("Missing");
  const missing = lib.rememberAnswer(c.id, { question: "¿Salario esperado?", answer: "" });
  assert.equal(missing.answer.needsReview, true);
  assert.throws(
    () => lib.rememberAnswer(c.id, { question: "¿Motivación?", answer: "x".repeat(20001) }),
    /String must contain at most|too_big/i,
  );
});

test("rememberAnswer never touches preferences, sources, application state or attempts", () => {
  const c = makeContext("Isolation", { dailyLimit: 5 });
  const job = apps.captureJob({
    contextId: c.id,
    title: "Isolated role",
    company: "Acme",
    url: "https://example.com/isolation-test",
  }).job;
  lib.rememberAnswer(c.id, { question: "¿Disponibilidad?", answer: "Inmediata", jobId: job.id });
  const reloaded = store.getContext(c.id);
  assert.deepEqual(reloaded.preferences.dailyLimit, 5);
  assert.deepEqual(reloaded.sources, []);
  const reloadedJob = store.getJob(job.id);
  assert.equal(reloadedJob.application.state, "none");
  assert.deepEqual(reloadedJob.application.attempts, []);
});

test("saveDraft persists even when the answer library throws", () => {
  const c = makeContext("Draft resilience");
  const job = apps.captureJob({
    contextId: c.id,
    title: "Role",
    company: "Acme",
    url: "https://example.com/draft-resilience",
  }).job;
  // Filling the context's answer collection to its cap makes rememberAnswer
  // throw as soon as learnDraftAnswers tries to add one more, well after
  // the draft itself has already been persisted by store.updateJob.
  const filler = Array.from({ length: 2000 }, (_, i) => ({
    id: `filler-${i}`,
    question: `Pregunta de relleno ${i}`,
    answer: `Respuesta ${i}`,
    scope: "application",
    needsReview: false,
    learnedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 0,
  }));
  store.saveContext({ id: c.id, answers: filler });
  const result = apps.saveDraft(job.id, {
    letterMarkdown: "Carta",
    answers: [{ question: "¿Detalle nuevo?", answer: "Nuevo", source: "" }],
    missing: [],
  });
  assert.equal(result.application.draft.letterMarkdown, "Carta");
  assert.equal(result.answersLearned, 0);
  assert.match(result.answersError, /2000/);
});

test("PATCH with a stale ifRevision conflicts and applies nothing", () => {
  const c = makeContext("Concurrency");
  const created = lib.rememberAnswer(c.id, { question: "¿Nivel de inglés?", answer: "B2" });
  assert.throws(
    () => lib.updateAnswer(c.id, created.answer.id, { answer: "C1", ifRevision: 7 }),
    (e) => {
      assert.equal(e instanceof lib.ConflictError, true);
      assert.equal(e.current.id, created.answer.id);
      return true;
    },
  );
  const stillOriginal = lib.getAnswer(c.id, created.answer.id);
  assert.equal(stillOriginal.answer, "B2");
  assert.equal(stillOriginal.revision, 0);
  const updated = lib.updateAnswer(c.id, created.answer.id, { answer: "C1", ifRevision: 0 });
  assert.equal(updated.answer, "C1");
  assert.equal(updated.revision, 1);
});

test("PATCH conflict responds 409 over HTTP with the current answer", async () => {
  const c = makeContext("HTTP conflict");
  const created = lib.rememberAnswer(c.id, { question: "¿Teléfono?", answer: "600000000" });
  const app = express();
  app.use(express.json());
  installWorkspaceRoutes(app, 0);
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/contexts/${c.id}/answers/${created.answer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: "600000001", ifRevision: 9 }),
      },
    );
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.conflict, true);
    assert.equal(body.current.id, created.answer.id);
  } finally {
    server.close();
  }
});

test("DELETE removes the answer for good and PUT never resurrects it, but keeps untouched entries", async () => {
  const c = makeContext("Delete and PUT merge");
  const keep = lib.rememberAnswer(c.id, { question: "¿Ciudad?", answer: "Madrid" }).answer;
  const gone = lib.rememberAnswer(c.id, { question: "¿Idioma nativo?", answer: "Español" }).answer;
  assert.equal(lib.deleteAnswer(c.id, gone.id), true);
  assert.equal(store.getContext(c.id).answers.length, 1);
  assert.ok(store.getContext(c.id).deletedAnswerIds.includes(gone.id));
  // A stale full PUT that still carries the deleted id (client had not
  // refreshed) must not bring it back, and must not drop `keep` either
  // even though the PUT body only mentions the deleted entry.
  const merged = lib.mergeAnswers(c.id, [
    { id: gone.id, question: gone.question, answer: gone.answer },
    { question: "Nueva sin id", answer: "Valor nuevo" },
  ]);
  assert.ok(!merged.some((a) => a.id === gone.id));
  assert.ok(merged.some((a) => a.id === keep.id));
  assert.ok(merged.some((a) => a.question === "Nueva sin id"));
});

test("recover: backs up before changing anything, is idempotent, and never resurrects a deleted answer", () => {
  const c = makeContext("Recovery");
  const job = apps.captureJob({
    contextId: c.id,
    title: "Recovered role",
    company: "Acme",
    url: "https://example.com/recovery-test",
  }).job;
  store.updateJob(job.id, {
    application: {
      ...job.application,
      draft: {
        cvMarkdown: "",
        letterMarkdown: "",
        answers: [{ question: "¿Modalidad preferida?", answer: "Remoto", source: "" }],
        missing: ["¿Fecha de incorporación?"],
        notes: "",
        lang: "es",
        savedAt: new Date().toISOString(),
      },
    },
  });
  const dbBefore = fsSync.readFileSync(store.DB_PATH, "utf8");
  const first = lib.recoverHistoricalAnswers({ contextId: c.id });
  assert.equal(first.added, 2);
  assert.ok(fsSync.existsSync(first.backup));
  assert.equal(fsSync.readFileSync(first.backup, "utf8"), dbBefore);
  const second = lib.recoverHistoricalAnswers({ contextId: c.id, force: true });
  assert.equal(second.added, 0);
  assert.equal(second.skippedDuplicates, 2);
  const recovered = store
    .getContext(c.id)
    .answers.find((a) => a.question === "¿Modalidad preferida?");
  assert.ok(recovered);
  assert.equal(lib.deleteAnswer(c.id, recovered.id), true);
  const third = lib.recoverHistoricalAnswers({ contextId: c.id, force: true });
  assert.equal(third.added, 0);
  assert.equal(third.skippedDeleted, 1);
  assert.ok(
    !store.getContext(c.id).answers.some((a) => a.question === "¿Modalidad preferida?"),
  );
});

test("file extraction only reads text, never executes .mjs, and reports what it could not parse", () => {
  const dir = path.join(root, "tests", "fixtures", "recovery");
  const result = recovery.extractFromFiles(dir);
  assert.equal(result.filesScanned, 5);
  assert.equal(result.candidates.length, 5);
  assert.ok(result.candidates.some((c) => c.question.includes("Docker")));
  assert.ok(result.candidates.some((c) => c.question.includes("Ciudad")));
  assert.deepEqual(result.unparsed.sort(), ["broken-attempt.json", "prepare-empty.mjs"]);
});

test("id migration on load does not reassign ids on a later restart", async () => {
  const dataDir = path.join(temp, "migration");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "db.json"),
    JSON.stringify({
      jobs: [],
      settings: {},
      contexts: [
        {
          id: "legacy",
          name: "Legacy",
          instructions: "",
          preferences: {},
          sources: [],
          answers: [{ question: "¿Pregunta antigua?", answer: "Respuesta antigua" }],
        },
      ],
      activeContextId: "legacy",
    }),
  );
  const run = (code) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        cwd: root,
        env: { ...process.env, JOBHUNT_DATA_DIR: dataDir },
      });
      let out = "",
        err = "";
      child.stdout.on("data", (b) => (out += b));
      child.stderr.on("data", (b) => (err += b));
      child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    });
  const first = await run(
    `import * as store from ${JSON.stringify(pathToFileURL(path.join(root, "server/store.js")).href)};
     store.listContexts();
     store.updateSettings({});
     console.log(store.getContext("legacy").answers[0].id);`,
  );
  const second = await run(
    `import * as store from ${JSON.stringify(pathToFileURL(path.join(root, "server/store.js")).href)};
     console.log(store.getContext("legacy").answers[0].id);`,
  );
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.equal(first, second);
});
