import crypto from "node:crypto";
import Papa from "papaparse";
import { learnDraftAnswers } from "./answer-library.js";
import { z } from "zod";
import * as store from "./store.js";
import { buildContext, contextFor } from "./context.js";

export const jobSchema = z
  .object({
    contextId: z.string().optional(),
    title: z.string().trim().min(1).max(300),
    company: z.string().max(300).default(""),
    url: z.string().max(3000).default(""),
    applyUrl: z.string().max(3000).default(""),
    description: z.string().max(60000).default(""),
    location: z.string().max(500).default(""),
    workMode: z
      .enum(["remote", "hybrid", "onsite", "unknown"])
      .default("unknown"),
    salary: z.string().max(500).default(""),
    salaryMin: z.number().nonnegative().nullable().default(null),
    salaryMax: z.number().nonnegative().nullable().default(null),
    salaryCurrency: z.string().length(3).default("EUR"),
    salaryPeriod: z.enum(["year", "month", "hour"]).default("year"),
    requiresRelocation: z.boolean().nullable().default(null),
    source: z.string().max(100).default("browser"),
    lang: z.string().max(10).default("es"),
    tags: z.array(z.string()).max(30).default([]),
  })
  .superRefine((j, ctx) => {
    for (const k of ["url", "applyUrl"])
      if (j[k]) {
        try {
          if (!["http:", "https:"].includes(new URL(j[k]).protocol))
            throw Error();
        } catch {
          ctx.addIssue({
            code: "custom",
            path: [k],
            message: "Usa una URL http o https.",
          });
        }
      }
  });
export function captureJob(input) {
  const data = jobSchema.parse(input),
    duplicate = store.findDuplicate(data);
  if (duplicate) return { job: duplicate, duplicate: true };
  return {
    job: store.addJob({
      ...data,
      remote:
        data.workMode === "remote"
          ? true
          : data.workMode === "unknown"
            ? null
            : false,
    }),
    duplicate: false,
  };
}
export function eligibility(job) {
  const p = contextFor(job.contextId).preferences,
    blockers = [],
    needsReview = [];
  const mode = job.workMode || (job.remote ? "remote" : "unknown");
  if (mode === "unknown") needsReview.push("La modalidad no está verificada.");
  if (p.remote === "only" && mode !== "remote" && mode !== "unknown")
    blockers.push("La búsqueda exige remoto.");
  for (const key of ["hybrid", "onsite"])
    if (mode === key) {
      if (p[key] === "no")
        blockers.push(
          `Modalidad ${key === "hybrid" ? "híbrida" : "presencial"} excluida.`,
        );
      if (p[key] === "ask")
        needsReview.push("Confirma esta modalidad con el usuario.");
    }
  if (job.requiresRelocation === true && p.relocate !== "yes")
    (p.relocate === "no" ? blockers : needsReview).push(
      "La oferta requiere traslado.",
    );
  if (job.requiresRelocation == null && p.relocate === "no")
    needsReview.push("No está verificado si exige traslado.");
  if (p.salaryMin != null && !(p.allowUndisclosedSalary && job.salaryMax == null)) {
    if (
      job.salaryMax == null ||
      job.salaryCurrency !== p.currency ||
      job.salaryPeriod !== "year"
    )
      needsReview.push("Falta un salario anual comparable con tu mínimo.");
    else if (job.salaryMax < p.salaryMin)
      blockers.push("El salario máximo está por debajo de tu mínimo.");
  }
  if (
    p.excludedCompanies
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(job.company.toLowerCase())
  )
    blockers.push("Empresa excluida.");
  if (!job.description?.trim())
    needsReview.push("Falta leer la descripción completa.");
  if (!job.company) needsReview.push("Falta identificar la empresa.");
  if (!job.applyUrl && !job.url)
    needsReview.push("Falta la URL de candidatura.");
  return {
    blockers,
    needsReview,
    preferences: p,
    eligible: blockers.length === 0 && needsReview.length === 0,
    agentChecks: [
      "Contrastar puesto, ubicación y requisitos con las preferencias e instrucciones en texto.",
      "Comprobar todas las respuestas obligatorias con datos reales.",
      "Usar solo documentos pertinentes para esta empresa.",
    ],
  };
}
export async function prepareApplication(id) {
  const job = store.getJob(id);
  if (!job) throw Error("La oferta no existe.");
  return {
    job,
    dossier: await buildContext(job.contextId),
    eligibility: eligibility(job),
    workflow: [
      "Leer la oferta con el navegador y actualizar los hechos verificados.",
      "Consultar fuentes y respuestas del contexto.",
      "Guardar CV, carta y respuestas específicas con save_application_draft.",
      "Solicitar start_application antes de rellenar/enviar; usar el navegador del cliente.",
      "Registrar confirmación visible con record_application_result; si el resultado es incierto, marcar unknown y no reenviar.",
    ],
    browserProvided: false,
  };
}
export const draftSchema = z.object({
  cvMarkdown: z.string().max(50000).default(""),
  letterMarkdown: z.string().max(20000).default(""),
  answers: z
    .array(
      z.object({
        question: z.string().min(1).max(2000),
        answer: z.string().max(15000),
        source: z.string().max(1000).default(""),
      }),
    )
    .max(100)
    .default([]),
  missing: z.array(z.string().max(2000)).max(100).default([]),
  notes: z.string().max(10000).default(""),
  lang: z.string().max(10).default("es"),
});
export function saveDraft(id, input) {
  const job = store.getJob(id);
  if (!job) throw Error("La oferta no existe.");
  const draft = {
    ...draftSchema.parse(input),
    savedAt: new Date().toISOString(),
  };
  if (
    ["in_progress", "unknown"].includes(job.application?.state) ||
    job.appliedAt
  )
    throw Error(
      "No modifiques una candidatura en curso, con envío incierto o ya enviada. Comprueba primero el portal.",
    );
  const patch = {
    application: { ...job.application, state: "prepared", draft },
  };
  if (draft.cvMarkdown || draft.letterMarkdown)
    patch.tailored = {
      ...(job.tailored || {}),
      cvMarkdown: draft.cvMarkdown || job.tailored?.cvMarkdown || "",
      letterMarkdown:
        draft.letterMarkdown || job.tailored?.letterMarkdown || "",
      lang: draft.lang,
      generatedAt: draft.savedAt,
    };
  if (["inbox", "interested"].includes(job.status)) patch.status = "tailored";
  const updated = store.updateJob(id, patch);
  // El borrador ya quedó persistido: un fallo de la biblioteca de
  // respuestas (contexto inconsistente, error de validación, etc.) nunca
  // debe hacer perder ni fingir que no se guardó el borrador.
  let answersLearned = 0,
    answersError;
  try {
    answersLearned = learnDraftAnswers(job, draft);
  } catch (e) {
    answersError = e.message;
  }
  return { ...updated, answersLearned, answersError };
}
export function startApplication(id) {
  const job = store.getJob(id);
  if (!job) throw Error("La oferta no existe.");
  if (
    job.appliedAt ||
    [
      "applied",
      "answered",
      "interview",
      "offer",
      "rejected",
      "discarded",
    ].includes(job.status)
  )
    throw Error("Candidatura ya enviada o cerrada; no volver a solicitar.");
  const current = job.application || {},
    e = eligibility(job);
  if (current.state === "unknown" || current.state === "in_progress")
    throw Error(
      "Existe un intento pendiente de comprobar. Revisa el portal y registra su resultado antes de reintentar.",
    );
  if (e.blockers.length) throw Error(e.blockers.join(" "));
  if (e.needsReview.length) throw Error(e.needsReview.join(" "));
  if (!current.draft || current.draft.missing?.length)
    throw Error(
      "Guarda el borrador y resuelve sus datos pendientes antes de empezar.",
    );
  if (
    e.preferences.automation !== "automatic" &&
    current.approvedDraftAt !== current.draft.savedAt
  )
    throw Error(
      "Este contexto pide revisión. Aprueba el borrador desde la ficha de candidatura.",
    );
  const today = new Date().toISOString().slice(0, 10);
  const count = store
    .listJobs()
    .filter((j) => j.contextId === job.contextId)
    .flatMap((j) => j.application?.attempts || [])
    .filter((a) => a.startedAt?.startsWith(today)).length;
  if (count >= e.preferences.dailyLimit)
    throw Error("Límite diario de intentos alcanzado para este contexto.");
  const attempt = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    state: "in_progress",
  };
  store.updateJob(id, {
    application: {
      ...current,
      state: "in_progress",
      attempts: [...(current.attempts || []), attempt],
    },
  });
  return {
    attemptId: attempt.id,
    jobId: id,
    applyUrl: job.applyUrl || job.url,
    notice:
      "Reserva registrada. La aplicación no ha enviado nada. Usa el navegador y registra el resultado visible. Si te interrumpes, no reenvíes sin comprobar el portal.",
  };
}
export function recordResult(id, { attemptId, outcome, evidence, notes = "" }) {
  const job = store.getJob(id),
    app = job?.application;
  const attempt = app?.attempts?.find((a) => a.id === attemptId);
  if (!attempt) throw Error("El intento no existe.");
  if (attempt.state === "submitted") return job;
  if (app.attempts.at(-1)?.id !== attemptId)
    throw Error("Este intento ya no es el actual.");
  if (!["submitted", "blocked", "unknown"].includes(outcome))
    throw Error("Resultado no válido.");
  if (!evidence?.trim())
    throw Error(
      "Incluye la confirmación visible, el bloqueo o la incertidumbre observada en el portal.",
    );
  const attempts = app.attempts.map((a) =>
    a.id === attemptId
      ? {
          ...a,
          state: outcome,
          evidence,
          notes,
          finishedAt: new Date().toISOString(),
        }
      : a,
  );
  return store.updateJob(id, {
    application: { ...app, state: outcome, attempts },
    ...(outcome === "submitted" ? { status: "applied" } : {}),
  });
}
// Contrato consumido por Faustus (server/agent-tools.js registra la
// herramienta MCP; server/workspace-routes.js expone el equivalente REST).
export const employerResponseSchema = z.object({
  externalId: z.string().trim().min(1).max(300),
  kind: z.enum([
    "ack",
    "info_request",
    "rejection",
    "interview",
    "offer",
    "unknown",
  ]),
  evidence: z.string().trim().min(1).max(10000),
  receivedAt: z.string().datetime(),
  interviewAt: z.string().datetime().optional(),
  timezone: z.string().max(64).optional(),
  calendarEventId: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
const TERMINAL_STATUSES = ["offer", "rejected", "discarded"];
const KIND_TO_STATUS = { rejection: "rejected", interview: "interview", offer: "offer" };
export function recordEmployerResponse(jobId, input) {
  const job = store.getJob(jobId);
  if (!job) throw Error("La oferta no existe.");
  const value = employerResponseSchema.parse(input);
  const responses = job.responses || [];
  const existingIndex = responses.findIndex((r) => r.externalId === value.externalId);
  if (existingIndex >= 0) {
    const existing = responses[existingIndex];
    // Idempotente: repetir el mismo externalId no cambia nada, salvo que la
    // llamada anterior se cortó antes de guardar el evento de calendario.
    if (value.calendarEventId && !existing.calendarEventId) {
      const linked = { ...existing, calendarEventId: value.calendarEventId };
      const next = responses.slice();
      next[existingIndex] = linked;
      return {
        job: store.updateJob(jobId, { responses: next }),
        applied: true,
        reason: "calendar event linked",
        response: linked,
      };
    }
    return { job, applied: false, reason: "already recorded", response: existing };
  }
  const response = {
    id: crypto.randomUUID(),
    externalId: value.externalId,
    kind: value.kind,
    evidence: value.evidence,
    receivedAt: value.receivedAt,
    interviewAt: value.interviewAt ?? null,
    timezone: value.timezone ?? null,
    calendarEventId: value.calendarEventId ?? null,
    notes: value.notes ?? "",
    recordedAt: new Date().toISOString(),
  };
  const patch = { responses: [...responses, response] };
  const lastHistoryAt = job.history?.at(-1)?.at;
  let nextStatus = null;
  if (TERMINAL_STATUSES.includes(job.status)) {
    // Un estado terminal solo se revierte ante evidencia posterior a la
    // última transición registrada y de un tipo que represente avance real.
    if (
      KIND_TO_STATUS[value.kind] &&
      lastHistoryAt &&
      new Date(value.receivedAt) > new Date(lastHistoryAt)
    ) {
      nextStatus = KIND_TO_STATUS[value.kind];
      response.notes = [response.notes, `overrode terminal state ${job.status}`]
        .filter(Boolean)
        .join(" ");
    }
  } else if (value.kind === "info_request") {
    if (job.status === "applied") nextStatus = "answered";
  } else if (KIND_TO_STATUS[value.kind]) {
    nextStatus = KIND_TO_STATUS[value.kind];
  }
  // ack y unknown nunca cambian el estado: un acuse de recibo no es una
  // aceptación ni una entrevista.
  if (nextStatus) patch.status = nextStatus;
  if (value.kind === "interview" && value.interviewAt)
    patch.interviewAt = value.interviewAt;
  return { job: store.updateJob(jobId, patch), applied: true, response };
}
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const statuses = {
  enviado: "applied",
  enviada: "applied",
  aplicada: "applied",
  applied: "applied",
  rechazado: "rejected",
  rechazada: "rejected",
  rejected: "rejected",
  pendiente: "inbox",
  inbox: "inbox",
  entrevista: "interview",
  interview: "interview",
  oferta: "offer",
  offer: "offer",
  respuesta: "answered",
  "en proceso": "answered",
  "en curso": "answered",
  answered: "answered",
  "me interesa": "interested",
  interested: "interested",
  "cv listo": "tailored",
  tailored: "tailored",
  descartada: "discarded",
  discarded: "discarded",
};
export function previewSheet(raw, contextId) {
  contextFor(contextId);
  const parsed = Papa.parse(raw.trim(), { skipEmptyLines: "greedy" });
  if (parsed.errors.some((e) => e.type === "Quotes"))
    throw Error(
      "Hay comillas sin cerrar en la hoja. Exporta CSV o pega las celdas de nuevo.",
    );
  const [headers, ...rows] = parsed.data,
    h = (headers || []).map(norm);
  const col = (names) => h.findIndex((v) => names.includes(v));
  const fields = {
    url: col(["link", "url", "enlace"]),
    company: col(["empresa", "company"]),
    title: col(["puesto", "title", "cargo"]),
    status: col(["estado", "status"]),
    mode: col(["tipo", "modalidad", "workmode"]),
    location: col(["ubicacion", "location"]),
    notes: col(["notas", "notes"]),
    applied: col(["aplicada", "fecha envio"]),
  };
  if (fields.title < 0 && fields.company < 0 && fields.url < 0)
    throw Error(
      "No encuentro columnas LINK, EMPRESA o PUESTO. Incluye la fila de cabeceras.",
    );
  if (rows.length > 2000)
    throw Error("Importa como máximo 2.000 filas cada vez.");
  const seen = new Set();
  return rows
    .map((row, index) => {
      const get = (name) => String(row[fields[name]] || "").trim();
      const mode = norm(get("mode")),
        status = norm(get("status"));
      let url = get("url"),
        company = get("company"),
        title = get("title");
      if (url && !/^https?:\/\//i.test(url)) {
        company ||= url;
        url = "";
      }
      const key = store.canonicalUrl(url) || norm(company) + "|" + norm(title);
      const duplicate =
        !!store.findDuplicate({ url, company, title }) || seen.has(key);
      seen.add(key);
      const warnings = [];
      if (status && !statuses[status])
        warnings.push(`Estado sin reconocer: ${get("status")}`);
      let appliedAt = null;
      if (get("applied")) {
        const date = new Date(get("applied"));
        if (Number.isNaN(+date)) warnings.push("Fecha de envío no reconocida");
        else appliedAt = date.toISOString();
      }
      return {
        row: index + 2,
        duplicate,
        warnings,
        item: {
          contextId,
          title: title || company || "Sin título",
          company,
          url,
          applyUrl: url,
          source: "hoja",
          location: get("location"),
          workMode: mode.startsWith("remot")
            ? "remote"
            : mode.startsWith("hibr")
              ? "hybrid"
              : mode.startsWith("prese")
                ? "onsite"
                : "unknown",
          status: statuses[status] || "inbox",
          notes: get("notes"),
          appliedAt,
        },
      };
    })
    .filter(
      (r) => r.item.company || r.item.url || r.item.title !== "Sin título",
    );
}
export function importSheet(raw, contextId) {
  const preview = previewSheet(raw, contextId);
  let added = 0,
    skipped = 0;
  const jobs = [];
  for (const row of preview) {
    if (row.duplicate) {
      skipped++;
      continue;
    }
    const j = store.addJob(row.item);
    store.updateJob(j.id, {
      status: row.item.status,
      notes: row.item.notes,
      appliedAt: row.item.appliedAt,
      nextActionAt: null,
      importedStatus: row.item.status,
      importedAt: new Date().toISOString(),
    });
    jobs.push(j);
    added++;
  }
  return { added, skipped, jobs };
}
