// Persistencia simple en JSON con escritura atómica. Cero dependencias nativas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR =
  process.env.JOBHUNT_DATA_DIR || path.join(__dirname, "..", "data");
export const DB_PATH = path.join(DATA_DIR, "db.json");
export const PROFILE_PATH = path.join(DATA_DIR, "profile.md");

const DEFAULT_SETTINGS = {
  provider: "openai", // 'openai' (Mistral/Groq/OpenRouter, compatible OpenAI) | 'gemini' | 'ollama'
  oaiPreset: "mistral",
  oaiBaseUrl: "https://api.mistral.ai/v1",
  oaiKey: "",
  oaiModel: "mistral-small-latest",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  adzunaAppId: "",
  adzunaAppKey: "",
  adzunaCountry: "es",
  weeklyGoal: 10,
  savedSearches: [],
  personal: {
    name: "",
    email: "",
    phone: "",
    location: "",
    github: "",
    portfolio: "",
    linkedin: "",
  },
};

let db = null;

function ensureLoaded() {
  if (db) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {
      throw new Error(
        "No se puede leer db.json. Recupera una copia de seguridad; no se han sobrescrito tus datos.",
      );
    }
  }
  if (!db) db = { jobs: [], settings: structuredClone(DEFAULT_SETTINGS) };
  db.contexts ??= [
    {
      id: "default",
      name: "Mi búsqueda",
      instructions: "",
      preferences: {},
      sources: [],
      answers: [],
    },
  ];
  // Migración de arranque única y acotada: da id a respuestas antiguas que
  // no lo tenían. No reasigna ids que ya existan y no toca ningún otro
  // campo. Queda en memoria hasta el primer save() posterior (no fuerza
  // escritura aquí para que leer el store nunca tenga efectos secundarios
  // en disco).
  for (const context of db.contexts)
    for (const answer of context.answers || [])
      answer.id ??= crypto.randomUUID();
  db.activeContextId ??= db.contexts[0]?.id;
  for (const job of db.jobs) job.contextId ??= "default";
  // merge de settings nuevos que no existieran
  db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...db.settings };
  db.settings.personal = {
    ...DEFAULT_SETTINGS.personal,
    ...(db.settings.personal || {}),
  };
  // migración: Gemini era el default pero su free tier no funciona en España/UE
  if (db.settings.provider === "gemini" && !db.settings.geminiKey)
    db.settings.provider = "openai";
}

export function save() {
  ensureLoaded();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// Copia de seguridad del fichero (no del objeto en memoria) antes de una
// operación de recuperación. Fuerza un save() previo para que la copia
// refleje el estado real ya persistido. Nombre compatible con Windows: sin
// ":" en la marca de tiempo.
export function backupNow() {
  ensureLoaded();
  save();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${DB_PATH}.bak-${stamp}`;
  fs.copyFileSync(DB_PATH, dest);
  return dest;
}

export function getSettings() {
  ensureLoaded();
  return db.settings;
}

export function updateSettings(patch) {
  ensureLoaded();
  const personal = { ...db.settings.personal, ...patch.personal };
  db.settings = { ...db.settings, ...patch, personal };
  save();
  return db.settings;
}

export function getProfile() {
  ensureLoaded();
  try {
    return fs.readFileSync(PROFILE_PATH, "utf8");
  } catch {
    return "";
  }
}

export function setProfile(markdown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, markdown ?? "", "utf8");
}

export function listJobs() {
  ensureLoaded();
  return db.jobs;
}

export function getJob(id) {
  ensureLoaded();
  return db.jobs.find((j) => j.id === id) || null;
}

function normKey(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function canonicalUrl(value) {
  try {
    const u = new URL(value);
    const linkedin =
      (u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) &&
      u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/);
    if (linkedin) return `https://www.linkedin.com/jobs/view/${linkedin[1]}`;
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|trk|trackingId|refId|ref$)/i.test(key))
        u.searchParams.delete(key);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return normKey(value);
  }
}

export function findDuplicate(candidate) {
  ensureLoaded();
  const url = canonicalUrl(candidate.url);
  const key = normKey(candidate.company) + "|" + normKey(candidate.title);
  return (
    db.jobs.find(
      (j) =>
        (url && canonicalUrl(j.url) === url) ||
        (!url &&
          !j.url &&
          key !== "|" &&
          normKey(j.company) + "|" + normKey(j.title) === key),
    ) || null
  );
}
export const jobExists = (candidate) => !!findDuplicate(candidate);

export function addJob(data) {
  ensureLoaded();
  const duplicate = findDuplicate(data);
  if (duplicate) return duplicate;
  const contextId = data.contextId || db.activeContextId;
  if (!getContext(contextId)) throw new Error("El contexto no existe.");
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    contextId,
    workMode: data.workMode || (data.remote === true ? "remote" : "unknown"),
    salaryMin: data.salaryMin ?? null,
    salaryMax: data.salaryMax ?? null,
    salaryCurrency: data.salaryCurrency || "EUR",
    salaryPeriod: data.salaryPeriod || "year",
    requiresRelocation: data.requiresRelocation ?? null,
    application: { state: "none", attempts: [], draft: null },
    title: data.title || "Sin título",
    company: data.company || "",
    location: data.location || "",
    remote: data.workMode && data.workMode !== "unknown" ? data.workMode === "remote" : data.remote ?? null,
    salary: data.salary || "",
    url: data.url || "",
    applyUrl: data.applyUrl || data.url || "",
    source: data.source || "manual",
    lang: data.lang || "es",
    tags: Array.isArray(data.tags) ? data.tags : [],
    description: data.description || "",
    postedAt: data.postedAt || null,
    status: "inbox",
    notes: "",
    score: null,
    scoreDetails: null,
    tailored: null,
    followup: null,
    interviewPrep: null,
    nextActionAt: null,
    interviewAt: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
    history: [{ status: "inbox", at: now }],
  };
  db.jobs.unshift(job);
  save();
  return job;
}

export function updateJob(id, patch) {
  ensureLoaded();
  const job = getJob(id);
  if (!job) return null;
  patch = { ...patch };
  if (patch.workMode) patch.remote = patch.workMode === "unknown" ? null : patch.workMode === "remote";
  for (const key of [
    "id",
    "createdAt",
    "history",
    "__proto__",
    "constructor",
    "prototype",
  ])
    delete patch[key];
  if (patch.contextId && !getContext(patch.contextId))
    throw new Error("El contexto no existe.");
  if (
    patch.status &&
    ![
      "inbox",
      "interested",
      "tailored",
      "applied",
      "answered",
      "interview",
      "offer",
      "rejected",
      "discarded",
    ].includes(patch.status)
  )
    throw new Error("Estado desconocido.");
  const now = new Date().toISOString();
  if (patch.status && patch.status !== job.status) {
    job.history.push({ status: patch.status, at: now });
    if (patch.status === "applied" && !job.appliedAt) job.appliedAt = now;
    // Al aplicar, programa follow-up automático a 10 días si no hay fecha ya puesta
    if (
      patch.status === "applied" &&
      !job.nextActionAt &&
      patch.nextActionAt === undefined
    ) {
      job.nextActionAt = new Date(Date.now() + 10 * 86400000).toISOString();
    }
    // Al recibir respuesta/avanzar, limpia el follow-up pendiente si no se especifica otro
    if (
      ["answered", "interview", "offer", "rejected", "discarded"].includes(
        patch.status,
      ) &&
      patch.nextActionAt === undefined
    ) {
      job.nextActionAt = null;
    }
  }
  Object.assign(job, patch, { updatedAt: now });
  save();
  return job;
}

export function exportAll() {
  ensureLoaded();
  return {
    jobs: db.jobs,
    settings: db.settings,
    contexts: db.contexts,
    activeContextId: db.activeContextId,
    profile: getProfile(),
    exportedAt: new Date().toISOString(),
    app: "jobhunt-copilot",
    version: 2,
  };
}

export function importAll(payload) {
  ensureLoaded();
  if (
    !payload ||
    payload.app !== "jobhunt-copilot" ||
    !Array.isArray(payload.jobs)
  ) {
    throw new Error("El fichero no parece un backup de Jubhunter's Hoard.");
  }
  db.jobs = payload.jobs;
  if (Array.isArray(payload.contexts) && payload.contexts.length)
    db.contexts = payload.contexts;
  db.activeContextId = db.contexts.some((c) => c.id === payload.activeContextId)
    ? payload.activeContextId
    : db.contexts[0].id;
  for (const job of db.jobs)
    if (!db.contexts.some((c) => c.id === job.contextId))
      job.contextId = db.activeContextId;
  if (payload.settings) db.settings = { ...db.settings, ...payload.settings };
  if (typeof payload.profile === "string") setProfile(payload.profile);
  save();
  return { jobs: db.jobs.length };
}

export function deleteJob(id) {
  ensureLoaded();
  const i = db.jobs.findIndex((j) => j.id === id);
  if (i === -1) return false;
  db.jobs.splice(i, 1);
  save();
  return true;
}

export function listContexts() {
  ensureLoaded();
  return db.contexts;
}
export function activeContextId() {
  ensureLoaded();
  return db.activeContextId;
}
export function getContext(id) {
  ensureLoaded();
  return db.contexts.find((c) => c.id === (id || db.activeContextId)) || null;
}
export function selectContext(id) {
  if (!getContext(id)) throw new Error("El contexto no existe.");
  db.activeContextId = id;
  save();
  return id;
}
export function saveContext(data) {
  ensureLoaded();
  let context = data.id ? getContext(data.id) : null;
  if (data.id && !context) throw new Error("El contexto no existe.");
  if (!context) {
    context = {
      id: crypto.randomUUID(),
      name: "Nueva búsqueda",
      instructions: "",
      preferences: {},
      sources: [],
      answers: [],
    };
    db.contexts.push(context);
  }
  Object.assign(context, data, {
    id: context.id,
    updatedAt: new Date().toISOString(),
  });
  save();
  return context;
}

export function invalidateApprovals(contextId) {
  ensureLoaded();
  let changed = false;
  for (const job of db.jobs)
    if (
      (!contextId || job.contextId === contextId) &&
      job.application?.approvedDraftAt
    ) {
      job.application.approvedDraftAt = null;
      changed = true;
    }
  if (changed) save();
}
