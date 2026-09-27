import test from "node:test";
import assert from "node:assert/strict";
import { agendaGroups, jobInsights, searchResultsByFreshness } from "../client/src/job-insights.js";
import { renderLetter } from "../client/src/letter-templates.js";

test("letter templates replace repeated variables literally and expose missing values", () => {
  assert.deepEqual(renderLetter("{{puesto}} en {{ empresa }}. {{PUESTO}}", { puesto: "R&D $&", empresa: "Árbol" }), { text: "R&D $& en Árbol. R&D $&", missing: [] });
  assert.deepEqual(renderLetter("{{empresa}} {{empresa}} {{otro}}", {}), { text: "{{empresa}} {{empresa}} {{otro}}", missing: ["empresa", "otro"] });
  assert.deepEqual(renderLetter("Carta general", {}), { text: "Carta general", missing: [] });
});

test("responses include rejected applications and preserve milestones after closing", () => {
  const jobs = [
    { status: "applied", appliedAt: "2026-09-07T12:00:00" },
    { status: "rejected", history: [{ status: "interview" }] },
    { status: "discarded", history: [{ status: "applied" }, { status: "answered" }] },
    { status: "inbox" },
    { status: "offer", appliedAt: "invalid" },
  ];
  const stats = jobInsights(jobs);
  assert.equal(stats.submitted.length, 4);
  assert.equal(stats.responses.length, 3);
  assert.equal(stats.interviews.length, 2);
  assert.equal(stats.offers.length, 1);
  assert.equal(stats.missingDates.length, 3);
});

test("agenda includes all of today, excludes closed jobs and exposes unplanned imports", () => {
  const jobs = [
    { id: "today", status: "applied", nextActionAt: "2026-09-08T18:00:00" },
    { id: "later", status: "answered", nextActionAt: "2026-09-09T09:00:00" },
    { id: "import", status: "applied", appliedAt: null },
    { id: "closed", status: "rejected", nextActionAt: "2026-09-07T09:00:00", interviewAt: "2026-09-09T09:00:00" },
    { id: "interview", status: "interview", interviewAt: "2026-09-09T09:00:00" },
    { id: "pending", status: "inbox" },
  ];
  const groups = agendaGroups(jobs, new Date("2026-09-08T10:00:00"));
  assert.deepEqual(groups.due.map((j) => j.id), ["today"]);
  assert.deepEqual(groups.future.map((j) => j.id), ["later"]);
  assert.deepEqual(groups.unplanned.map((j) => j.id), ["import"]);
  assert.deepEqual(groups.interviews.map((j) => j.id), ["interview"]);
});

test("search freshness keeps unknown dates visible and original import indices stable", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const jobs = [
    { title: "old", postedAt: "2026-08-01T00:00:00Z" },
    { title: "undated", postedAt: null },
    { title: "recent", postedAt: "2026-09-26T12:00:00Z" },
    { title: "invalid", postedAt: "not a date" },
    { title: "week", postedAt: "2026-09-21T12:00:00Z" },
  ];
  assert.deepEqual(searchResultsByFreshness(jobs, 7, "recent", now).map(({ job, index }) => [job.title, index]),
    [["recent", 2], ["week", 4], ["undated", 1], ["invalid", 3]]);
  assert.deepEqual(searchResultsByFreshness(jobs, 7, "source", now).map(({ index }) => index), [1, 2, 3, 4]);
  assert.deepEqual(searchResultsByFreshness(jobs, 0, "recent", now).map(({ index }) => index), [2, 4, 0, 1, 3]);
});
