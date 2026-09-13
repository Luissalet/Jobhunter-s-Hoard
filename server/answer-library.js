import crypto from "node:crypto";
import { z } from "zod";
import * as store from "./store.js";

export const answerSchema = z.object({
  id: z.string().max(100).optional(),
  question: z.string().trim().min(1).max(2000),
  answer: z.string().max(20000),
  source: z.string().max(2000).optional(),
  jobId: z.string().max(100).optional(),
  scope: z.enum(["profile", "application"]).optional(),
  needsReview: z.boolean().optional(),
  learnedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
});
// Edición parcial de una respuesta existente: mismos límites que answerSchema,
// todo opcional. ifRevision no es un campo de la respuesta: es la comprobación
// de concurrencia optimista que compara con `answer.revision`.
export const answerPatchSchema = z.object({
  question: z.string().trim().min(1).max(2000).optional(),
  answer: z.string().max(20000).optional(),
  source: z.string().max(2000).optional(),
  scope: z.enum(["profile", "application"]).optional(),
  needsReview: z.boolean().optional(),
  ifRevision: z.number().int().nonnegative().optional(),
});

const MAX_ANSWERS = 2000;
const MAX_DELETED_IDS = 5000;

// Normaliza para comparar (nunca para guardar): NFKC, minúsculas, sin
// acentos, sin ¿?* y espacios colapsados. Dos preguntas distintas nunca se
// fusionan: la igualdad exige coincidencia exacta tras esta normalización.
const key = (s) =>
  String(s)
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/[¿?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export class ConflictError extends Error {
  constructor(current) {
    super("Otra tarea cambió esta respuesta; recarga.");
    this.conflict = true;
    this.current = current;
  }
}

function touch(context, patch) {
  store.saveContext({
    id: context.id,
    ...patch,
    answersRevision: (context.answersRevision || 0) + 1,
  });
}

// Historical answers are evidence from one form, never silent profile updates.
export function rememberAnswer(contextId, input) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const value = answerSchema.parse(input);
  if (value.jobId && store.getJob(value.jobId)?.contextId !== context.id)
    throw Error("La candidatura no pertenece a este contexto.");
  const answers = context.answers || [];
  const sameQuestion = answers.filter(
    (a) => key(a.question) === key(value.question),
  );
  const existing = sameQuestion.find((a) => key(a.answer) === key(value.answer));
  if (existing) return { answer: existing, added: false };
  if (answers.length >= MAX_ANSWERS)
    throw Error("Límite de 2000 respuestas alcanzado en este contexto.");
  const now = new Date().toISOString();
  const entry = {
    ...value,
    id: value.id || crypto.randomUUID(),
    scope: value.scope || "application",
    needsReview:
      value.needsReview ?? (!value.answer.trim() || sameQuestion.length > 0),
    learnedAt: value.learnedAt || now,
    updatedAt: now,
    revision: 0,
  };
  touch(context, { answers: [...answers, entry] });
  return { answer: entry, added: true };
}

// Devuelve cuántas respuestas nuevas quedaron guardadas (added:true). Puede
// lanzar (contexto inexistente, oferta de otro contexto, etc.); saveDraft es
// quien decide no dejar que ese fallo invalide un borrador ya persistido.
export function learnDraftAnswers(job, draft) {
  let learned = 0;
  for (const item of draft.answers || [])
    if (rememberAnswer(job.contextId, { ...item, jobId: job.id, scope: "application" }).added)
      learned++;
  for (const question of draft.missing || [])
    if (
      rememberAnswer(job.contextId, {
        question,
        answer: "",
        jobId: job.id,
        scope: "application",
        needsReview: true,
      }).added
    )
      learned++;
  return learned;
}

export function listAnswers(contextId) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  return { answers: context.answers || [], revision: context.answersRevision || 0 };
}

export function getAnswer(contextId, answerId) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const answer = (context.answers || []).find((a) => a.id === answerId);
  if (!answer) throw Error("La respuesta no existe.");
  return answer;
}

// PATCH por id con control de concurrencia optimista. ifRevision ausente
// aplica sin comprobar (edición directa desde la UI tras releer la lista);
// ifRevision presente que no coincide con la revisión actual (tratando la
// ausencia de `revision` en respuestas migradas como 0) devuelve conflicto
// sin aplicar ningún cambio.
export function updateAnswer(contextId, answerId, patch) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const answers = context.answers || [];
  const index = answers.findIndex((a) => a.id === answerId);
  if (index === -1) throw Error("La respuesta no existe.");
  const current = answers[index];
  const { ifRevision, ...fields } = answerPatchSchema.parse(patch);
  const currentRevision = current.revision ?? 0;
  if (ifRevision !== undefined && ifRevision !== currentRevision)
    throw new ConflictError(current);
  const now = new Date().toISOString();
  const updated = {
    ...current,
    ...fields,
    id: current.id,
    revision: currentRevision + 1,
    updatedAt: now,
  };
  const next = answers.slice();
  next[index] = updated;
  touch(context, { answers: next });
  return updated;
}

// Borrado real (splice), nunca lógico: el id queda en deletedAnswerIds
// (acotado) para que ninguna recuperación posterior lo resucite.
export function deleteAnswer(contextId, answerId) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const answers = context.answers || [];
  if (!answers.some((a) => a.id === answerId)) return false;
  const deletedAnswerIds = [...(context.deletedAnswerIds || []), answerId].slice(
    -MAX_DELETED_IDS,
  );
  touch(context, {
    answers: answers.filter((a) => a.id !== answerId),
    deletedAnswerIds,
  });
  return true;
}

// Fusión usada por PUT /api/contexts/:id cuando el body trae `answers`:
// entradas con id existente se actualizan in place, ids ausentes del body
// NO se borran (el borrado solo ocurre por DELETE), entradas sin id se
// añaden con la misma deduplicación que rememberAnswer, e ids ya borrados
// nunca resucitan.
export function mergeAnswers(contextId, incoming) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const deleted = new Set(context.deletedAnswerIds || []);
  let answers = (context.answers || []).slice();
  const now = new Date().toISOString();
  for (const raw of incoming) {
    const value = answerSchema.parse(raw);
    if (value.jobId && store.getJob(value.jobId)?.contextId !== context.id)
      throw Error("La candidatura no pertenece a este contexto.");
    if (value.id && deleted.has(value.id)) continue;
    if (value.id) {
      const index = answers.findIndex((a) => a.id === value.id);
      if (index >= 0) {
        const current = answers[index];
        answers[index] = {
          ...current,
          ...value,
          id: current.id,
          revision: (current.revision ?? 0) + 1,
          updatedAt: now,
        };
      } else if (answers.length < MAX_ANSWERS) {
        answers.push({
          ...value,
          scope: value.scope || "application",
          needsReview: value.needsReview ?? !value.answer.trim(),
          learnedAt: value.learnedAt || now,
          updatedAt: now,
          revision: 0,
        });
      }
    } else {
      const sameQuestion = answers.filter(
        (a) => key(a.question) === key(value.question),
      );
      const existing = sameQuestion.find((a) => key(a.answer) === key(value.answer));
      if (existing || answers.length >= MAX_ANSWERS) continue;
      answers.push({
        ...value,
        id: crypto.randomUUID(),
        scope: value.scope || "application",
        needsReview:
          value.needsReview ?? (!value.answer.trim() || sameQuestion.length > 0),
        learnedAt: now,
        updatedAt: now,
        revision: 0,
      });
    }
  }
  return answers;
}

// Id determinista (no aleatorio) para candidatos recuperados de borradores:
// permite detectar en pasadas posteriores que ese mismo contenido ya fue
// borrado explícitamente por el usuario (deletedAnswerIds), algo que una
// deduplicación solo por clave no distinguiría de "nunca se añadió".
function recoveredId(contextId, question, answer) {
  return (
    "rec-" +
    crypto
      .createHash("sha1")
      .update(`${contextId}${key(question)}${key(answer)}`)
      .digest("hex")
  );
}

// Recupera respuestas de los borradores y `missing` ya guardados en las
// candidaturas del contexto. No se ejecuta nunca automáticamente al
// instalar rutas: solo bajo demanda explícita (endpoint), con backup previo
// del fichero. Repetible: `force` permite reintentar tras backup aunque ya
// se marcara `answersRecoveredAt`; sin `force`, una segunda pasada normal
// no vuelve a escanear un contexto ya recuperado.
export function recoverHistoricalAnswers({ contextId, force = false } = {}) {
  const backup = store.backupNow();
  const contexts = contextId
    ? [store.getContext(contextId)].filter(Boolean)
    : store.listContexts();
  if (contextId && !contexts.length) throw Error("El contexto no existe.");
  let jobsScanned = 0,
    draftsScanned = 0,
    added = 0,
    skippedDuplicates = 0,
    skippedDeleted = 0;
  const now = new Date().toISOString();
  for (const context of contexts) {
    if (context.answersRecoveredAt && !force) continue;
    const deleted = new Set(context.deletedAnswerIds || []);
    let answers = (context.answers || []).slice();
    const seen = new Set(
      answers.map((a) => key(a.question) + " " + key(a.answer)),
    );
    const jobs = store.listJobs().filter((j) => j.contextId === context.id);
    for (const job of jobs) {
      jobsScanned++;
      const draft = job.application?.draft;
      if (!draft) continue;
      draftsScanned++;
      const candidates = [
        ...(draft.answers || []).map((a) => ({
          question: a.question,
          answer: a.answer,
          source: a.source || "",
        })),
        ...(draft.missing || []).map((question) => ({
          question,
          answer: "",
          needsReview: true,
        })),
      ];
      for (const c of candidates) {
        if (!c.question?.trim()) continue;
        const id = recoveredId(context.id, c.question, c.answer);
        const seenKey = key(c.question) + " " + key(c.answer);
        if (deleted.has(id)) {
          skippedDeleted++;
          continue;
        }
        if (seen.has(seenKey)) {
          skippedDuplicates++;
          continue;
        }
        seen.add(seenKey);
        answers.push({
          id,
          question: c.question,
          answer: c.answer,
          source: c.source || `Borrador: ${job.title || job.company || job.id}`,
          jobId: job.id,
          scope: "application",
          needsReview: c.needsReview ?? (!c.answer?.trim() || false),
          learnedAt: now,
          updatedAt: now,
          revision: 0,
        });
        added++;
      }
    }
    store.saveContext({
      id: context.id,
      answers,
      answersRecoveredAt: now,
      answersRevision: (context.answersRevision || 0) + 1,
    });
  }
  return {
    contexts: contexts.length,
    jobsScanned,
    draftsScanned,
    added,
    skippedDuplicates,
    skippedDeleted,
    backup,
  };
}
