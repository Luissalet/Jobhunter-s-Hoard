// What the shared Faustus copilot asks this app for: the real objects open in the current view, the unsaved form fields,
// and a way to refresh the open view when the assistant finishes a turn. Nothing here renders anything.
// The app has no URLs of its own (tabs and dialogs are state), so every view reports itself through the registry below.
import { api } from "./api.js";

const EVENT = "jobhunter:context-request";
const PAGES = ["applications", "agenda", "search", "context", "connection", "stats", "settings"];
const TAB_PAGE = { pipeline: "applications", agenda: "agenda", search: "search", context: "context", connection: "connection", stats: "stats", settings: "settings" };
const MAX_SELECTED = 10;
const SECRET_SETTINGS = ["oaiKey", "geminiKey", "adzunaAppKey"];

// ---- partial saves -----------------------------------------------------------------------------------------------------

// Fields of `draft` whose value differs from `initial` (compared as JSON, so a cleared text counts as a change).
export function changedFields(initial, draft) {
  const base = initial || {};
  return Object.fromEntries(Object.entries(draft || {}).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])));
}

// A refreshed baseline arrives while the user is editing: fields the user did not touch follow the new baseline, touched ones stay.
export function rebaseForm(previousBase, nextBase, form) {
  const out = { ...nextBase };
  for (const key of Object.keys(form || {})) {
    if (JSON.stringify(form[key]) !== JSON.stringify(previousBase?.[key])) out[key] = form[key];
  }
  return out;
}

// Same for a context draft, one level deeper for `preferences` (the assistant may change one preference while the user edits another).
export function rebaseContext(previousBase, nextBase, form) {
  const out = rebaseForm(previousBase, nextBase, form);
  if (form?.preferences && nextBase?.preferences) out.preferences = rebaseForm(previousBase?.preferences, nextBase.preferences, form.preferences);
  return out;
}

// What a context save sends: only what the user changed, laid over the context as the server has it now.
export function contextToSave(fresh, base, draft) {
  const { answers: _answers, ...current } = fresh || {};
  const changed = changedFields(base, draft);
  const out = { ...current, ...changed };
  if (changed.preferences) out.preferences = { ...(current.preferences || {}), ...changedFields(base?.preferences, draft.preferences) };
  return { body: out, changed: Object.keys(changed) };
}

// What a draft save sends: the saved draft as the server has it now, with only the fields the user changed laid over it.
export function draftToSave(freshDraft, base, draft) {
  const { savedAt: _savedAt, ...current } = freshDraft || {};
  return { ...current, ...changedFields(base, draft) };
}

// ---- registry ------------------------------------------------------------------------------------------------------------

// Every mounted page and open form answers this event: `editor(snapshot)` for a form ({ kind, object_id, dirty, fields }),
// `view(partial)` for what the page shows (tab, filters, open dialog).
export function collectContext(target = globalThis.window) {
  const editors = [];
  const view = {};
  if (!target?.dispatchEvent) return { editors, view };
  target.dispatchEvent(new CustomEvent(EVENT, {
    detail: {
      editor: (snapshot) => { if (snapshot) editors.push(snapshot); },
      view: (partial) => { if (partial && typeof partial === "object") Object.assign(view, partial); },
    },
  }));
  editors.sort((a, b) => Number(!!b.dirty) - Number(!!a.dirty));
  return { editors, view };
}

// Answer the context request: `getter()` returns { editors?: [snapshot|null], view?: {...} } and is read at ask time.
export function registerProvider(getter, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const handler = (event) => {
    let out = null;
    try { out = getter(); } catch { out = null; }
    if (!out) return;
    for (const snapshot of out.editors || []) if (snapshot) event.detail.editor(snapshot);
    if (out.view) event.detail.view(out.view);
  };
  target.addEventListener(EVENT, handler);
  return () => target.removeEventListener(EVENT, handler);
}

// ---- objects -------------------------------------------------------------------------------------------------------------

const pick = (source, keys) => Object.fromEntries(keys.filter((k) => source?.[k] !== undefined && source[k] !== null && source[k] !== "").map((k) => [k, source[k]]));
export const clip = (text, n) => (typeof text === "string" && text.length > n ? `${text.slice(0, n)}...` : text);

export function jobObject(j) {
  const draft = j.application?.draft;
  return {
    kind: "job", object_id: j.id, title: j.title,
    ...pick(j, ["company", "status", "location", "workMode", "salary", "score", "source", "appliedAt", "nextActionAt", "interviewAt", "url"]),
    context_id: j.contextId,
    ...(j.scoreDetails?.verdict ? { fit: j.scoreDetails.verdict } : {}),
    ...(j.notes ? { notes: clip(j.notes, 400) } : {}),
    ...(j.description ? { description: clip(j.description, 600) } : {}),
    ...(j.application?.state ? { application_state: j.application.state } : {}),
    ...(draft ? { draft: { saved_at: draft.savedAt, answers: draft.answers?.length || 0, missing: draft.missing?.length || 0, approved: j.application.approvedDraftAt === draft.savedAt } } : {}),
    ...(j.application?.attempts?.length ? { attempts: j.application.attempts.length } : {}),
    ...(j.responses?.length ? { employer_responses: j.responses.length } : {}),
    ...(j.tailored?.cvMarkdown ? { has_cv: true } : {}),
    ...(j.tailored?.letterMarkdown ? { has_letter: true } : {}),
  };
}

export function contextObject(c) {
  const prefs = pick(c.preferences || {}, ["roles", "locations", "remote", "hybrid", "onsite", "relocate", "salaryMin", "salaryTarget", "currency", "excludedCompanies", "automation", "dailyLimit"]);
  return {
    kind: "context", object_id: c.id, title: c.name,
    ...(c.instructions ? { instructions: clip(c.instructions, 400) } : {}),
    sources: c.sources?.length || 0,
    ...(Array.isArray(c.answers) ? { answers: c.answers.length } : {}),
    ...(Object.keys(prefs).length ? { preferences: prefs } : {}),
  };
}

// The form values for the copilot: long texts shortened.
export function clipFields(fields, n = 1500) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, typeof value === "string" ? clip(value, n) : value]));
}

export const answerObject = (a, contextId) => ({
  kind: "answer", object_id: a.id, title: clip(a.question, 200), ...(a.answer ? { answer: clip(a.answer, 300) } : {}),
  ...pick(a, ["scope"]), ...(a.needsReview ? { needs_review: true } : {}), context_id: contextId,
});

// Settings without the keys of the providers: the assistant never needs them and they never leave the browser.
export function scrubSettings(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = SECRET_SETTINGS.includes(key) ? (value ? "(changed)" : "(cleared)") : value;
  return out;
}

async function safe(fn) {
  try { return await fn(); } catch { return null; }
}

// Pure core (dependencies injected so it can be tested): never throws; unknown or "new" ids yield no object.
export async function buildContext({ editors = [], view: viewInfo = {}, loadState, loadAnswers = (contextId) => api.workspace(`/api/contexts/${contextId}/answers`) }) {
  const state = await safe(loadState);
  const jobs = Array.isArray(state?.jobs) ? state.jobs : [];
  const contexts = Array.isArray(state?.contexts) ? state.contexts : [];
  const active = contexts.find((c) => c.id === state?.activeContextId) || contexts[0] || null;
  const page = PAGES.includes(viewInfo.page) ? viewInfo.page : TAB_PAGE[viewInfo.tab] || "applications";
  const objects = [];
  const seen = new Set();
  const add = (object) => { if (!object?.object_id) return; const key = `${object.kind}:${object.object_id}`; if (!seen.has(key)) { seen.add(key); objects.push(object); } };
  const realId = (id) => (id && id !== "new" ? String(id) : null);

  const view = { page, route: `/${page}` };

  // A job dialog on top of whatever page is open.
  const jobId = realId(viewInfo.job_id);
  const open = jobId ? jobs.find((j) => j.id === jobId) : null;
  if (open) {
    view.job_id = open.id;
    if (viewInfo.detail_tab) view.detail_tab = viewInfo.detail_tab;
    view.route = `/${page}/jobs/${open.id}`;
    add(jobObject(open));
    const own = contexts.find((c) => c.id === open.contextId);
    if (own) add(contextObject(own));
  }
  if (viewInfo.adding) view.adding_job = true;

  if (page === "applications") {
    if (viewInfo.filters && Object.keys(viewInfo.filters).length) view.filters = viewInfo.filters;
    if (viewInfo.visible != null) view.visible = viewInfo.visible;
    const ticked = (Array.isArray(viewInfo.selected) ? viewInfo.selected : []).map((id) => jobs.find((x) => x.id === id)).filter(Boolean);
    for (const j of ticked.slice(0, MAX_SELECTED)) add(jobObject(j));
    if (ticked.length) view.selected = ticked.length;
  }
  if (page === "agenda" && viewInfo.agenda) view.agenda = viewInfo.agenda;
  if (page === "search" && viewInfo.filters && Object.keys(viewInfo.filters).length) view.filters = viewInfo.filters;
  if (page === "context") {
    if (viewInfo.section) view.section = viewInfo.section;
    if (active) add(contextObject(active));
    if (viewInfo.answer_id && active) {
      const answers = await safe(() => loadAnswers(active.id));
      const a = (answers?.answers || []).find((x) => x.id === viewInfo.answer_id);
      if (a) add(answerObject(a, active.id));
    }
  }
  if ((page === "applications" || page === "agenda" || page === "stats") && active) add(contextObject(active));

  const editor = editors.find((e) => e.dirty) || editors[0];
  if (editor) view.editor = editor;
  if (editors.length > 1) view.editors = editors;

  const out = { active_objects: objects, view };
  // The contexts are this app's workspaces: the one in use is the project (one conversation per search).
  if (active) out.project = { external_project_id: active.id, title: active.name };
  return out;
}

export function context() {
  const { editors, view } = collectContext();
  return buildContext({ editors, view, loadState: () => api.state() });
}

// ---- refresh when the assistant finishes a turn --------------------------------------------------------------------------
const refreshers = new Set();
let timer = null;

function scheduleRefresh() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const fn of [...refreshers]) { try { fn(); } catch { /* a refresh must never break the page */ } }
  }, 250);
}

// A page registers what "reload what is on screen" means (it keeps the forms the user is editing untouched).
export function subscribeRefresh(fn) {
  refreshers.add(fn);
  return () => refreshers.delete(fn);
}

export const onTurnEnd = () => scheduleRefresh();

// Once at start: the object the launcher looks for, and the window event it dispatches on turn end (the debounce merges the two).
export function installCopilot(target = globalThis.window) {
  if (!target || target.hoardCopilot) return;
  target.hoardCopilot = { context, onTurnEnd };
  target.addEventListener("hoard:copilot-turn-end", scheduleRefresh);
}