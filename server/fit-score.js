// Encaje por criterio: cada requisito de la oferta con su peso, la evidencia del CV y de la
// oferta, las carencias y el plan de candidatura que sale de la puntuación.
//
// El peso de un requisito se deduce de la oferta, nunca de lo que el candidato sabe: por eso
// `inferred` (peso deducido del mercado) no puede ser `critical` ni `high`, y `stated` exige la
// cita literal de la oferta. La puntuación se calcula aquí, no la escribe el modelo.
import { z } from "zod";
import * as store from "./store.js";

export const IMPORTANCE_WEIGHT = {
  critical: 5,
  high: 4,
  meaningful: 3,
  preferred: 2,
  low_signal: 1,
};
export const MATCH_VALUE = { strong: 1, partial: 0.5, missing: 0, na: null };
const IMPORTANCE = Object.keys(IMPORTANCE_WEIGHT);
const MATCH = Object.keys(MATCH_VALUE);
const TIERS = ["stated", "structural", "inferred"];

// Bandas de decisión sobre 0-100. El corte de «aplicar» es el 4.0/5 de la escala de cinco
// niveles, para que el número siga significando lo mismo que en el resto de la app.
export const FIT_BANDS = [
  { min: 80, decision: "aplicar", label: "Aplicar" },
  { min: 60, decision: "dudoso", label: "Dudoso: solo con una razón concreta" },
  { min: 0, decision: "descartar", label: "Descartar" },
];

export const criterionSchema = z.object({
  requirement: z.string().trim().min(1).max(500),
  importance: z.enum(IMPORTANCE).default("meaningful"),
  evidence: z.enum(TIERS).default("inferred"),
  jdSignal: z.string().max(1000).default(""),
  match: z.enum(MATCH),
  cvEvidence: z.string().max(2000).default(""),
  gap: z.string().max(2000).default(""),
  risk: z.string().max(2000).default(""),
  mitigation: z.string().max(2000).default(""),
});

export const fitInputSchema = z.object({
  verdict: z.string().max(1000).default(""),
  criteria: z.array(criterionSchema).min(1).max(40),
  keywords: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  strengths: z.array(z.string().max(1000)).max(20).default([]),
  gaps: z.array(z.string().max(1000)).max(20).default([]),
});

/** Un peso deducido del mercado no puede crear obligaciones, y `stated` sin cita no es `stated`. */
export function gate(criterion) {
  let out = criterion;
  if (out.evidence === "stated" && !out.jdSignal.trim())
    out = { ...out, evidence: "structural", downgraded: true };
  if (
    out.evidence === "inferred" &&
    (out.importance === "critical" || out.importance === "high")
  )
    out = { ...out, importance: "meaningful", downgraded: true };
  return out;
}

function bandFor(score) {
  return FIT_BANDS.find((band) => score >= band.min);
}

/** Pasos de candidatura que salen de la puntuación: qué cubrir, con qué evidencia y qué preparar. */
function buildPlan({ rows, decision, keywords }) {
  const steps = [];
  const blocking = rows.filter((row) => row.blocking);
  const strong = rows.filter(
    (row) => row.match === "strong" && row.importance !== "low_signal",
  );
  if (decision === "descartar") {
    steps.push(
      "No preparar la candidatura: el encaje no llega al mínimo. Si aun así interesa, resolver antes las carencias críticas.",
    );
    if (strong.length)
      steps.push(
        `Lo que sí tienes para esta oferta: ${strong
          .slice(0, 3)
          .map((row) => row.requirement)
          .join("; ")}.`,
      );
  } else {
    if (keywords.length)
      steps.push(
        `Adaptar el CV con estas palabras clave de la oferta: ${keywords.slice(0, 12).join(", ")}.`,
      );
    if (strong.length)
      steps.push(
        `Abrir el CV y la carta con la evidencia más cercana al puesto: ${strong
          .slice(0, 3)
          .map((row) => row.requirement)
          .join("; ")}.`,
      );
  }
  for (const row of blocking)
    steps.push(
      `Cubrir «${row.requirement}»: ${
        row.mitigation || row.gap || "demostrar experiencia adyacente"
      }${row.risk ? ` (en entrevista: ${row.risk})` : ""}`,
    );
  const partial = rows.filter((row) => row.match === "partial" && !row.blocking);
  if (partial.length)
    steps.push(
      `Preparar ejemplos para los requisitos parciales: ${partial
        .slice(0, 5)
        .map((row) => row.requirement)
        .join("; ")}.`,
    );
  return steps;
}

/** Puntúa un análisis ya hecho: pesos, media ponderada, carencias que bloquean y plan. */
export function computeFit(input) {
  const parsed = fitInputSchema.parse(input);
  const rows = parsed.criteria.map(gate);
  let weighted = 0;
  let weight = 0;
  const criteria = rows.map((row) => {
    const value = MATCH_VALUE[row.match];
    const rowWeight = IMPORTANCE_WEIGHT[row.importance];
    if (value != null) {
      weighted += rowWeight * value;
      weight += rowWeight;
    }
    return {
      ...row,
      weight: rowWeight,
      value,
      blocking:
        value != null &&
        value < 1 &&
        (row.importance === "critical" || row.importance === "high"),
    };
  });
  if (!weight)
    throw new Error(
      "Ningún criterio se puede puntuar: todos están marcados como no aplicables.",
    );
  const score = Math.round((weighted / weight) * 100);
  const band = bandFor(score);
  const blocking = criteria.filter((row) => row.blocking);
  const gaps = parsed.gaps.length
    ? parsed.gaps
    : blocking.map((row) => row.gap || row.requirement);
  return {
    score,
    decision: band.decision,
    decisionLabel: band.label,
    verdict: parsed.verdict,
    criteria,
    blocking: blocking.map((row) => ({
      requirement: row.requirement,
      importance: row.importance,
      match: row.match,
      gap: row.gap,
      risk: row.risk,
      mitigation: row.mitigation,
    })),
    gaps,
    strengths: parsed.strengths,
    keywords: parsed.keywords,
    plan: buildPlan({ rows: criteria, decision: band.decision, keywords: parsed.keywords }),
    downgraded: criteria.filter((row) => row.downgraded).map((row) => row.requirement),
    computedAt: new Date().toISOString(),
  };
}

/** Guarda el encaje en la oferta. El número global y el resumen corto quedan también donde la interfaz ya los lee. */
export function scoreJobFit(jobId, input) {
  const job = store.getJob(jobId);
  if (!job) throw new Error("La oferta no existe.");
  const fit = computeFit(input);
  return store.updateJob(jobId, {
    fit,
    score: fit.score,
    scoreDetails: {
      score: fit.score,
      verdict: fit.verdict,
      strengths: fit.strengths,
      gaps: fit.gaps,
      keywords: fit.keywords,
    },
  });
}

export function getJobFit(jobId) {
  const job = store.getJob(jobId);
  if (!job) throw new Error("La oferta no existe.");
  return {
    jobId: job.id,
    title: job.title,
    company: job.company,
    fit: job.fit || null,
    notice: job.fit
      ? ""
      : "Esta oferta no tiene encaje por criterio. Analízala con score_job_fit.",
  };
}

/** Ofertas con encaje, de mayor a menor, para decidir a cuál dedicar el tiempo. */
export function rankJobsByFit({ contextId = "", limit = 20 } = {}) {
  const jobs = store
    .listJobs()
    .filter((job) => job.fit && (!contextId || job.contextId === contextId))
    .sort((a, b) => b.fit.score - a.fit.score);
  return {
    total: jobs.length,
    jobs: jobs.slice(0, limit).map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      status: job.status,
      score: job.fit.score,
      decision: job.fit.decision,
      blocking: job.fit.blocking.length,
    })),
  };
}