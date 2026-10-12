// The Faustus copilot's view of the app: real objects per view, unsaved form fields, changed-only saves, refresh on turn end.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext, changedFields, collectContext, contextToSave, draftToSave, installCopilot, rebaseContext, rebaseForm, registerProvider,
  scrubSettings, subscribeRefresh,
} from "../client/src/copilot-context.js";

const contexts = [
  { id: "c1", name: "IA Espana", instructions: "Prioriza roles de IA.", sources: [{ id: "s1" }, { id: "s2" }], answers: [{ id: "a1" }], preferences: { roles: "AI Engineer", remote: "preferred", automation: "review", dailyLimit: 10 } },
  { id: "c2", name: "Backend", sources: [], preferences: {} },
];
const jobs = [
  {
    id: "j1", contextId: "c1", title: "ML Engineer", company: "Acme", status: "tailored", workMode: "remote", score: 82, scoreDetails: { verdict: "Buen encaje" },
    notes: "Hablar con Marta.", description: "x".repeat(900), nextActionAt: "2026-10-20T09:00:00", responses: [{ id: "r1" }],
    application: { state: "prepared", draft: { savedAt: "t1", answers: [{ question: "Salario?", answer: "" }], missing: ["Telefono"] }, approvedDraftAt: null, attempts: [] },
    tailored: { cvMarkdown: "# CV", letterMarkdown: "" },
  },
  { id: "j2", contextId: "c1", title: "Data Engineer", company: "Beta", status: "inbox" },
];
const state = { jobs, contexts, activeContextId: "c1", settings: { oaiKey: "secret" } };
const loadState = async () => state;
const loadAnswers = async () => ({ answers: [{ id: "a1", question: "Permiso de trabajo?", answer: "UE", scope: "profile" }] });
const ids = (ctx) => ctx.active_objects.map((o) => `${o.kind}:${o.object_id}`);

test("only the fields the user changed are sent, including manual clears", () => {
  assert.deepEqual(changedFields({ a: "x", b: "y", c: 1 }, { a: "x", b: "", c: 2 }), { b: "", c: 2 });
  assert.deepEqual(changedFields({ a: 1 }, { a: 1 }), {});
  assert.deepEqual(changedFields(null, { a: 1 }), { a: 1 });
});

test("a reload keeps what the user typed and updates the rest, one level deeper for preferences", () => {
  assert.deepEqual(rebaseForm({ title: "A", notes: "n" }, { title: "B", notes: "n" }, { title: "A", notes: "mine" }), { title: "B", notes: "mine" });
  const before = { name: "S", preferences: { roles: "AI", remote: "any" } };
  const after = { name: "S", preferences: { roles: "AI", remote: "only" } };   // the assistant changed remote
  const form = { name: "S", preferences: { roles: "AI Engineer", remote: "any" } };   // the user edited roles
  assert.deepEqual(rebaseContext(before, after, form), { name: "S", preferences: { roles: "AI Engineer", remote: "only" } });
});

test("saving a context lays only the user's changes over the context as the server has it now", () => {
  const base = { id: "c1", name: "IA", instructions: "old", preferences: { roles: "AI", remote: "any" } };
  const fresh = { id: "c1", name: "IA", instructions: "old", answers: [{ id: "a1" }], preferences: { roles: "AI", remote: "only" } };   // the assistant set remote
  const draft = { id: "c1", name: "IA", instructions: "mine", preferences: { roles: "AI", remote: "any" } };
  const { body, changed } = contextToSave(fresh, base, draft);
  assert.deepEqual(changed, ["instructions"]);
  assert.equal(body.instructions, "mine");
  assert.equal(body.preferences.remote, "only");   // not overwritten by the stale form
  assert.equal(body.answers, undefined);
});

test("saving a draft keeps what the assistant wrote in fields the user did not touch", () => {
  const base = { cvMarkdown: "cv", letterMarkdown: "carta", answers: [], missing: ["Telefono"], lang: "es", savedAt: "t1" };
  const fresh = { ...base, answers: [{ question: "Salario?", answer: "40k", source: "" }], missing: [], savedAt: "t2" };   // the assistant answered
  const mine = { ...base, letterMarkdown: "carta nueva" };
  const out = draftToSave(fresh, base, mine);
  assert.equal(out.letterMarkdown, "carta nueva");
  assert.equal(out.answers[0].answer, "40k");
  assert.deepEqual(out.missing, []);
  assert.equal(out.savedAt, undefined);
});

test("settings never carry the keys of the providers", () => {
  assert.deepEqual(scrubSettings({ oaiKey: "sk-1", geminiKey: "", adzunaAppKey: "k", oaiModel: "m" }), { oaiKey: "(changed)", geminiKey: "(cleared)", adzunaAppKey: "(changed)", oaiModel: "m" });
});

test("the applications list reports its filters, the ticked rows and the search in use as the project", async () => {
  const ctx = await buildContext({ loadState, loadAnswers, editors: [], view: { page: "applications", visible: 1, selected: ["j2", "ghost"], filters: { status: "inbox" } } });
  assert.deepEqual(ids(ctx), ["job:j2", "context:c1"]);
  assert.equal(ctx.view.page, "applications");
  assert.deepEqual(ctx.view.filters, { status: "inbox" });
  assert.equal(ctx.view.selected, 1);
  assert.deepEqual(ctx.project, { external_project_id: "c1", title: "IA Espana" });
  assert.equal(ctx.active_objects[1].sources, 2);
  assert.equal(ctx.active_objects[1].preferences.roles, "AI Engineer");
});

test("an open job returns the real job and its search; the detail tab and unsaved fields travel in the view", async () => {
  const editors = [{ kind: "job-notes", object_id: "j1", dirty: true, fields: { notes: "Hablar con Marta y Luis." } }];
  const ctx = await buildContext({ loadState, loadAnswers, editors, view: { tab: "pipeline", job_id: "j1", detail_tab: "draft" } });
  assert.deepEqual(ids(ctx).slice(0, 2), ["job:j1", "context:c1"]);
  const job = ctx.active_objects[0];
  assert.equal(job.title, "ML Engineer");
  assert.equal(job.fit, "Buen encaje");
  assert.equal(job.description.length, 603);   // clipped
  assert.deepEqual(job.draft, { saved_at: "t1", answers: 1, missing: 1, approved: false });
  assert.equal(job.employer_responses, 1);
  assert.equal(job.has_cv, true);
  assert.equal(job.has_letter, undefined);
  assert.equal(ctx.view.job_id, "j1");
  assert.equal(ctx.view.detail_tab, "draft");
  assert.equal(ctx.view.route, "/applications/jobs/j1");
  assert.equal(ctx.view.editor.fields.notes, "Hablar con Marta y Luis.");
});

test("creation forms, the unknown id and the new id give no object and never throw", async () => {
  const adding = await buildContext({ loadState, loadAnswers, editors: [{ kind: "job-new", object_id: null, dirty: true, fields: { title: "Nuevo" } }], view: { tab: "pipeline", adding: true } });
  assert.equal(adding.view.adding_job, true);
  assert.equal(adding.view.editor.kind, "job-new");
  assert.ok(!ids(adding).some((x) => x.startsWith("job:")));
  for (const job_id of ["ghost", "new", "", null, undefined]) {
    const ctx = await buildContext({ loadState, loadAnswers, editors: [], view: { page: "agenda", job_id } });
    assert.ok(Array.isArray(ctx.active_objects));
    assert.ok(!ctx.active_objects.some((o) => o.kind === "job"));
    assert.equal(ctx.view.job_id, undefined);
  }
});

test("the context page names the context and the answer being edited; the pages without objects return an empty list", async () => {
  const ctx = await buildContext({ loadState, loadAnswers, editors: [], view: { page: "context", section: "answers", answer_id: "a1" } });
  assert.deepEqual(ids(ctx), ["context:c1", "answer:a1"]);
  assert.equal(ctx.view.section, "answers");
  for (const page of ["settings", "search", "connection"]) {
    const other = await buildContext({ loadState, loadAnswers, editors: [], view: { page } });
    assert.deepEqual(other.active_objects, []);
    assert.equal(other.view.page, page);
  }
  const unknown = await buildContext({ loadState, loadAnswers, editors: [], view: { page: "nowhere" } });
  assert.equal(unknown.view.page, "applications");
});

test("a failing server never makes the context throw", async () => {
  const ctx = await buildContext({ loadState: async () => { throw new Error("down"); }, loadAnswers, editors: [], view: { page: "applications" } });
  assert.deepEqual(ctx.active_objects, []);
  assert.equal(ctx.project, undefined);
});

test("pages and forms answer the context request and the first dirty editor leads", () => {
  const target = new EventTarget();
  const off1 = registerProvider(() => ({ view: { page: "applications" }, editors: [{ kind: "sheet-import", dirty: false }] }), target);
  const off2 = registerProvider(() => ({ editors: [null, { kind: "job-notes", dirty: true }] }), target);
  const { editors, view } = collectContext(target);
  assert.equal(view.page, "applications");
  assert.deepEqual(editors.map((e) => e.kind), ["job-notes", "sheet-import"]);
  off1(); off2();
  assert.deepEqual(collectContext(target), { editors: [], view: {} });
});

test("the launcher object is installed once and a turn end refreshes the subscribed views once", async () => {
  const win = new EventTarget();
  installCopilot(win);
  const hook = win.hoardCopilot;
  assert.equal(typeof hook.context, "function");
  assert.equal(typeof hook.onTurnEnd, "function");
  installCopilot(win);
  assert.equal(win.hoardCopilot, hook);
  let calls = 0;
  const off = subscribeRefresh(() => { calls += 1; });
  hook.onTurnEnd();
  win.dispatchEvent(new Event("hoard:copilot-turn-end"));
  hook.onTurnEnd();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(calls, 1);
  off();
});