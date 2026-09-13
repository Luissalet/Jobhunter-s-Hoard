import { z } from "zod";
import * as store from "./store.js";

export const answerSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().max(20000),
  source: z.string().max(2000).optional(),
  jobId: z.string().max(100).optional(),
  scope: z.enum(["profile", "application"]).optional(),
  needsReview: z.boolean().optional(),
  learnedAt: z.string().optional(),
});
const key = (s) => String(s).normalize("NFKC").toLocaleLowerCase().replace(/[¿?*]/g, "").replace(/\s+/g, " ").trim();

// Historical answers are evidence from one form, never silent profile updates.
export function rememberAnswer(contextId, input) {
  const context = store.getContext(contextId);
  if (!context) throw Error("El contexto no existe.");
  const value = answerSchema.parse(input);
  if (value.jobId && store.getJob(value.jobId)?.contextId !== context.id)
    throw Error("La candidatura no pertenece a este contexto.");
  const answers = context.answers || [];
  const sameQuestion = answers.filter((a) => key(a.question) === key(value.question));
  const existing = sameQuestion.find((a) => key(a.answer) === key(value.answer));
  if (existing) return { answer: existing, added: false };
  const entry = { ...value, scope: value.scope || "application", needsReview: value.needsReview ?? (!value.answer.trim() || sameQuestion.length > 0), learnedAt: new Date().toISOString() };
  store.saveContext({ id: context.id, answers: [...answers, entry] });
  return { answer: entry, added: true };
}

export function learnDraftAnswers(job, draft) {
  for (const item of draft.answers || []) rememberAnswer(job.contextId, { ...item, jobId: job.id, scope: "application" });
  for (const question of draft.missing || []) rememberAnswer(job.contextId, { question, answer: "", jobId: job.id, scope: "application", needsReview: true });
}

export function recoverHistoricalAnswers() {
  let added = 0;
  for (const context of store.listContexts()) {
    if (context.answersRecoveredAt) continue;
    const before = (context.answers || []).length;
    for (const job of store.listJobs().filter((j) => j.contextId === context.id))
      if (job.application?.draft) learnDraftAnswers(job, job.application.draft);
    added += (store.getContext(context.id).answers || []).length - before;
    store.saveContext({ id: context.id, answersRecoveredAt: new Date().toISOString() });
  }
  return added;
}
