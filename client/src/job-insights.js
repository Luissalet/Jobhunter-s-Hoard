export const submittedStatuses = ["applied", "answered", "interview", "offer", "rejected"];
export const closedStatuses = ["rejected", "discarded", "offer"];
export const validDate = (value) => !!value && Number.isFinite(new Date(value).getTime());
export function searchResultsByFreshness(results, ageDays = 0, sortBy = 'recent', now = new Date()) {
  const today = now.getTime();
  const limit = ageDays ? today - ageDays * 86_400_000 : -Infinity;
  const dated = results.map((job, index) => {
    const parsed = job.postedAt ? new Date(job.postedAt).getTime() : NaN;
    const timestamp = Number.isFinite(parsed) && parsed <= today + 86_400_000 ? Math.min(parsed, today) : null;
    return { job, index, timestamp };
  }).filter(({ timestamp }) => timestamp === null || timestamp >= limit);
  if (sortBy === 'recent') {
    dated.sort((a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity) || a.index - b.index);
  }
  return dated;
}
export const wasSubmitted = (job) => submittedStatuses.includes(job.status) || validDate(job.appliedAt) || job.history?.some((entry) => submittedStatuses.includes(entry.status));
export const hasResponse = (job) => ["answered", "interview", "offer", "rejected"].includes(job.status) || job.history?.some((entry) => ["answered", "interview", "offer", "rejected"].includes(entry.status));
export function agendaGroups(jobs, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 15);
  const active = jobs.filter((j) => !closedStatuses.includes(j.status));
  const ordered = (list, field) => [...list].sort((a, b) => new Date(a[field]) - new Date(b[field]));
  return {
    due: ordered(active.filter((j) => validDate(j.nextActionAt) && new Date(j.nextActionAt) < tomorrow), "nextActionAt"),
    future: ordered(active.filter((j) => validDate(j.nextActionAt) && new Date(j.nextActionAt) >= tomorrow), "nextActionAt"),
    interviews: ordered(active.filter((j) => validDate(j.interviewAt) && new Date(j.interviewAt) >= today && new Date(j.interviewAt) < horizon), "interviewAt"),
    unplanned: active.filter((j) => ["applied", "answered", "interview"].includes(j.status) && !validDate(j.nextActionAt) && !(validDate(j.interviewAt) && new Date(j.interviewAt) >= today)),
  };
}
export function jobInsights(jobs) {
  const submitted = jobs.filter(wasSubmitted);
  const responses = submitted.filter(hasResponse);
  return { submitted, responses, missingDates: submitted.filter((j) => !validDate(j.appliedAt)),
    interviews: jobs.filter((j) => ["interview", "offer"].includes(j.status) || j.history?.some((h) => ["interview", "offer"].includes(h.status))),
    offers: jobs.filter((j) => j.status === "offer" || j.history?.some((h) => h.status === "offer")),
  };
}
export function localDateValue(value) {
  if (!validDate(value)) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
