// Saved data (db.json, profile.md) and what counts as "the same posting".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jobhunt-store-"));
process.env.JOBHUNT_DATA_DIR = path.join(temp, "data");
const store = await import("../server/store.js");
after(() => fs.rm(temp, { recursive: true, force: true }));

test("canonicalUrl applies the shared URL rules and falls back to the text for anything that is not a web address", () => {
  const same = (a, b) => assert.equal(store.canonicalUrl(a), store.canonicalUrl(b), `${a} ~ ${b}`);
  same("https://example.com/jobs/42/?utm_source=x&utm_campaign=y#apply", "https://EXAMPLE.com:443/jobs/42");
  same("https://example.com/jobs?b=2&a=1", "https://example.com/jobs?a=1&b=2");
  same("https://example.com/jobs/42?trackingId=1&refId=2&ref=3", "https://example.com/jobs/42");
  // LinkedIn: the job id wins over the title slug, the tracking and the country subdomain
  same("https://es.linkedin.com/jobs/view/senior-dev-at-acme-3812345678?trackingId=abc&refId=def", "https://www.linkedin.com/jobs/view/3812345678/");
  same("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3812345678", "https://www.linkedin.com/jobs/view/3812345678");
  // a parameter that names the posting is kept
  assert.notEqual(store.canonicalUrl("https://example.com/search?jk=aaa"), store.canonicalUrl("https://example.com/search?jk=bbb"));
  assert.notEqual(store.canonicalUrl("https://example.com/jobs/1"), store.canonicalUrl("https://example.com/jobs/2"));
  // not a web address: the lowercased, squeezed text
  assert.equal(store.canonicalUrl("  Pegado   a MANO "), "pegado a mano");
  assert.equal(store.canonicalUrl(""), "");
  assert.equal(store.canonicalUrl(undefined), "");
  assert.equal(store.canonicalUrl("mailto:rrhh@example.com"), "mailto:rrhh@example.com");
});

test("a posting saved with tracking in its link is still found when the same posting arrives clean", () => {
  const first = store.addJob({ title: "Backend developer", company: "Acme", url: "https://jobs.example.com/p/77?utm_source=newsletter&b=2&a=1" });
  assert.ok(store.jobExists({ url: "https://jobs.example.com/p/77?a=1&b=2" }));
  assert.equal(store.addJob({ title: "Backend developer", company: "Acme", url: "https://JOBS.example.com/p/77/?a=1&b=2#top" }).id, first.id);
  const li = store.addJob({ title: "Dev", company: "Globex", url: "https://www.linkedin.com/jobs/view/dev-at-globex-4000000001?trackingId=zz" });
  assert.equal(store.addJob({ title: "Dev", company: "Globex", url: "https://es.linkedin.com/jobs/view/4000000001/" }).id, li.id);
  // without a link the company and title decide
  const manual = store.addJob({ title: "Data analyst", company: "Initech", url: "" });
  assert.equal(store.addJob({ title: "  data   ANALYST ", company: "initech", url: "" }).id, manual.id);
  assert.equal(store.listJobs().length, 3);
});

test("db.json and profile.md are written whole, through a temporary file that never stays behind", async () => {
  store.setProfile("# Perfil\n\nÁngel — desarrollo.");
  store.updateSettings({ weeklyGoal: 7 });
  for (let i = 0; i < 20; i++) store.addJob({ title: `Role ${i}`, company: "Many", url: `https://example.com/r/${i}` });
  const dir = path.dirname(store.DB_PATH);
  const names = await fs.readdir(dir);
  assert.deepEqual(names.filter((n) => n.endsWith(".tmp")), []);
  const onDisk = JSON.parse(await fs.readFile(store.DB_PATH, "utf8"));
  assert.equal(onDisk.jobs.length, store.listJobs().length);
  assert.equal(onDisk.settings.weeklyGoal, 7);
  assert.equal(await fs.readFile(store.PROFILE_PATH, "utf8"), "# Perfil\n\nÁngel — desarrollo.");
  assert.equal(store.getProfile(), "# Perfil\n\nÁngel — desarrollo.");
  store.setProfile("");
  assert.equal(await fs.readFile(store.PROFILE_PATH, "utf8"), "");
});

test("a backup copy reflects what is on disk and keeps a Windows-safe name", async () => {
  const dest = store.backupNow();
  assert.doesNotMatch(path.basename(dest), /:/);
  assert.deepEqual(JSON.parse(await fs.readFile(dest, "utf8")), JSON.parse(await fs.readFile(store.DB_PATH, "utf8")));
});
