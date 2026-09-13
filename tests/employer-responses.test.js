import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jobhunt-responses-test-"));
process.env.JOBHUNT_DATA_DIR = path.join(temp, "data");
const store = await import("../server/store.js");
const apps = await import("../server/applications.js");

after(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

function makeJob(title) {
  const c = store.saveContext({ name: `Context ${title}`, preferences: {} });
  return apps.captureJob({
    contextId: c.id,
    title,
    company: "Acme",
    url: `https://example.com/responses/${title}`,
  }).job;
}

test("record_employer_response is idempotent by externalId", () => {
  const job = makeJob("idempotent");
  const a = apps.recordEmployerResponse(job.id, {
    externalId: "msg-1",
    kind: "ack",
    evidence: "Hemos recibido tu candidatura.",
    receivedAt: "2026-01-01T10:00:00.000Z",
  });
  assert.equal(a.applied, true);
  assert.equal(a.job.responses.length, 1);
  const b = apps.recordEmployerResponse(job.id, {
    externalId: "msg-1",
    kind: "ack",
    evidence: "Hemos recibido tu candidatura. (repetido)",
    receivedAt: "2026-01-01T10:00:00.000Z",
  });
  assert.equal(b.applied, false);
  assert.equal(b.reason, "already recorded");
  assert.equal(b.job.responses.length, 1);
  assert.equal(b.response.evidence, "Hemos recibido tu candidatura.");
});

test("ack never changes status; a repeated externalId only backfills a missing calendar event", () => {
  const job = makeJob("ack-no-change");
  store.updateJob(job.id, { status: "applied" });
  const first = apps.recordEmployerResponse(job.id, {
    externalId: "msg-ack",
    kind: "ack",
    evidence: "Acuse de recibo automático.",
    receivedAt: "2026-01-02T09:00:00.000Z",
  });
  assert.equal(first.job.status, "applied");
  const linked = apps.recordEmployerResponse(job.id, {
    externalId: "msg-ack",
    kind: "ack",
    evidence: "Acuse de recibo automático.",
    receivedAt: "2026-01-02T09:00:00.000Z",
    calendarEventId: "cal-123",
  });
  assert.equal(linked.applied, true);
  assert.equal(linked.reason, "calendar event linked");
  assert.equal(linked.response.calendarEventId, "cal-123");
  assert.equal(linked.job.status, "applied");
  assert.equal(linked.job.responses.length, 1);
  // A third call with the same event id changes nothing further.
  const third = apps.recordEmployerResponse(job.id, {
    externalId: "msg-ack",
    kind: "ack",
    evidence: "Acuse de recibo automático.",
    receivedAt: "2026-01-02T09:00:00.000Z",
    calendarEventId: "cal-999",
  });
  assert.equal(third.applied, false);
  assert.equal(third.response.calendarEventId, "cal-123");
});

test("info_request only moves to answered from applied; interview sets interviewAt only when provided", () => {
  const job = makeJob("info-request");
  const beforeApplied = apps.recordEmployerResponse(job.id, {
    externalId: "msg-info-early",
    kind: "info_request",
    evidence: "¿Puedes confirmar tu disponibilidad?",
    receivedAt: "2026-01-03T09:00:00.000Z",
  });
  assert.equal(beforeApplied.job.status, "inbox");
  store.updateJob(job.id, { status: "applied" });
  const afterApplied = apps.recordEmployerResponse(job.id, {
    externalId: "msg-info-late",
    kind: "info_request",
    evidence: "¿Puedes confirmar tu disponibilidad?",
    receivedAt: "2026-01-04T09:00:00.000Z",
  });
  assert.equal(afterApplied.job.status, "answered");
  const interview = apps.recordEmployerResponse(job.id, {
    externalId: "msg-interview",
    kind: "interview",
    evidence: "Te invitamos a una entrevista.",
    receivedAt: "2026-01-05T09:00:00.000Z",
    interviewAt: "2026-01-10T15:00:00.000Z",
    timezone: "Europe/Madrid",
  });
  assert.equal(interview.job.status, "interview");
  assert.equal(interview.job.interviewAt, "2026-01-10T15:00:00.000Z");
  const interviewNoDate = makeJob("interview-no-date");
  const withoutDate = apps.recordEmployerResponse(interviewNoDate.id, {
    externalId: "msg-interview-2",
    kind: "interview",
    evidence: "Te llamaremos para agendar.",
    receivedAt: "2026-01-06T09:00:00.000Z",
  });
  assert.equal(withoutDate.job.status, "interview");
  assert.equal(withoutDate.job.interviewAt, null);
});

test("a terminal state is preserved unless later evidence advances it, and the override is noted", () => {
  const job = makeJob("terminal");
  store.updateJob(job.id, { status: "rejected" });
  const rejectedAt = store.getJob(job.id).history.at(-1).at;
  const before = new Date(rejectedAt);
  before.setSeconds(before.getSeconds() - 10);
  const stale = apps.recordEmployerResponse(job.id, {
    externalId: "msg-stale-interview",
    kind: "interview",
    evidence: "Oferta de entrevista con fecha anterior al rechazo.",
    receivedAt: before.toISOString(),
  });
  assert.equal(stale.job.status, "rejected", "un rechazo no se revierte con evidencia anterior");
  const after = new Date(rejectedAt);
  after.setSeconds(after.getSeconds() + 10);
  const override = apps.recordEmployerResponse(job.id, {
    externalId: "msg-fresh-interview",
    kind: "interview",
    evidence: "En realidad seguimos adelante con una entrevista.",
    receivedAt: after.toISOString(),
  });
  assert.equal(override.job.status, "interview");
  assert.match(override.response.notes, /overrode terminal state rejected/);
  const ackAfterOverride = apps.recordEmployerResponse(job.id, {
    externalId: "msg-ack-after",
    kind: "ack",
    evidence: "Acuse de recibo.",
    receivedAt: after.toISOString(),
  });
  assert.equal(ackAfterOverride.job.status, "interview", "ack nunca cambia el estado");
});

test("unknown never changes the status", () => {
  const job = makeJob("unknown-kind");
  const result = apps.recordEmployerResponse(job.id, {
    externalId: "msg-unknown",
    kind: "unknown",
    evidence: "Mensaje sin clasificar con claridad.",
    receivedAt: "2026-01-07T09:00:00.000Z",
  });
  assert.equal(result.job.status, "inbox");
});

test("recording responses never touches application.attempts or their evidence", () => {
  const c = store.saveContext({ name: "Attempts untouched", preferences: {} });
  const job = apps.captureJob({
    contextId: c.id,
    title: "attempts-untouched",
    company: "Acme",
    url: "https://example.com/responses/attempts-untouched",
    description: "Trabajo full remoto en un equipo distribuido.",
    workMode: "remote",
  }).job;
  store.saveContext({
    id: c.id,
    preferences: { ...c.preferences, automation: "automatic" },
  });
  apps.saveDraft(job.id, { letterMarkdown: "Carta factual" });
  const attempt = apps.startApplication(job.id);
  apps.recordResult(job.id, {
    attemptId: attempt.attemptId,
    outcome: "submitted",
    evidence: "Portal mostró: Solicitud recibida.",
  });
  const before = JSON.parse(JSON.stringify(store.getJob(job.id).application.attempts));
  apps.recordEmployerResponse(job.id, {
    externalId: "msg-post-submit",
    kind: "interview",
    evidence: "Te invitamos a una entrevista.",
    receivedAt: "2026-01-08T09:00:00.000Z",
    interviewAt: "2026-01-12T10:00:00.000Z",
  });
  assert.deepEqual(store.getJob(job.id).application.attempts, before);
});
