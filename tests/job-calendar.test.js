import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-calendar-'));
process.env.JOBHUNT_DATA_DIR = directory;
process.env.HOARD_HUB_URL = 'http://127.0.0.1:9';
process.env.HOARD_EVENTS = '0';
const store = await import('../server/store.js');
const { exportJobCalendar, calendarDate } = await import('../server/job-calendar.js');
const { callTool } = await import('../server/agent-tools.js');
after(() => fs.rm(directory, { recursive: true, force: true }));

test('calendar preserves visible IDs and strict stored time semantics, RFC bytes and records', async () => {
  const rows = [
    store.addJob({ title: 'Entrevista, con; acentos á🧭'.repeat(8) + '\nBEGIN:VEVENT', company: 'Empresa ficticia', url: 'https://example.invalid/oferta', interviewAt: '2026-10-25T02:30:00+02:00', notes: 'PRIVATE_NOTES' }),
    store.addJob({ title: 'Revisión flotante', nextActionAt: '2026-10-25T09:00:00' }),
    store.addJob({ title: 'Día completo', nextActionAt: '2026-10-26' }),
    store.addJob({ title: 'Sin fecha' }),
    store.addJob({ title: 'Fecha inválida', nextActionAt: '2026-02-30T09:00:00Z' }),
  ];
  const outsider = store.addJob({ title: 'OUT_OF_SCOPE', interviewAt: '2026-10-25T10:00:00Z' });
  store.updateJob(rows[0].id, { interviewAt: '2026-10-25T02:30:00+02:00', nextActionAt: '2026-10-25T02:30:00+02:00', notes: 'PRIVATE_NOTES' });
  store.updateJob(rows[1].id, { nextActionAt: '2026-10-25T09:00:00' });
  store.updateJob(rows[2].id, { nextActionAt: '2026-10-26' });
  store.updateJob(rows[4].id, { nextActionAt: '2026-02-30T09:00:00Z' });
  store.updateJob(outsider.id, { interviewAt: '2026-10-25T10:00:00Z' });
  const before = await fs.readFile(store.DB_PATH);
  const fixed = new Date('2026-10-23T14:00:00Z');
  const interview = exportJobCalendar([rows[0].id, rows[0].id], 'interview', fixed);
  assert.equal(interview.events.length, 1);
  assert.equal(interview.events[0].start, '2026-10-25T00:30:00Z');
  assert.equal(interview.events[0].original, '2026-10-25T02:30:00+02:00');
  assert.match(interview.ics, /DTSTART:20261025T003000Z\r\n/);
  const reviewIds = rows.slice(1).map(row => row.id).concat('missing');
  const review = exportJobCalendar(reviewIds, 'review', fixed);
  assert.deepEqual(review.events.map(event => event.type), ['floating', 'date']);
  assert.deepEqual(review.skipped.map(item => item.reason), ['missing_date', 'invalid_date', 'not_found']);
  assert.match(review.ics, /DTSTART:20261025T090000\r\n/);
  assert.match(review.ics, /DTSTART;VALUE=DATE:20261026\r\n/);
  assert.equal(exportJobCalendar([rows[0].id], 'interview', fixed).events[0].uid, interview.events[0].uid);
  assert.notEqual(exportJobCalendar([rows[0].id], 'review', fixed).events[0]?.uid, interview.events[0].uid);
  const unfolded = interview.ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:.*Entrevista\\, con\\; acentos/);
  assert.ok(unfolded.includes('\\nBEGIN:VEVENT'));
  assert.equal((unfolded.match(/^BEGIN:VEVENT$/gm) || []).length, 1);
  for (const line of interview.ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(!interview.ics.replaceAll('\r\n', '').includes('\n'));
  assert.ok(!unfolded.includes('PRIVATE_NOTES') && !unfolded.includes('OUT_OF_SCOPE'));
  assert.ok(!review.ics.includes(outsider.id));
  assert.ok(!/DTEND|DURATION|VALARM|ATTENDEE|METHOD:REQUEST/.test(unfolded));
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-01-01T24:00:00', '2026-01-01T09:61:00Z', '2026-01-01T09:00:00+24:00', '0000-01-01', '2026-1-1']) assert.equal(calendarDate(value), null, value);
  assert.equal(calendarDate('2028-02-29').type, 'date');
  assert.equal(calendarDate('2026-10-25T02:30:00+01:00').start, '2026-10-25T01:30:00Z');
  assert.deepEqual(await fs.readFile(store.DB_PATH), before);
  const native = await callTool('export_job_calendar', { jobIds: reviewIds, kind: 'review' });
  assert.deepEqual(native.events, review.events);
  const server = await startServer({ data: directory, env: { HOARD_EVENTS: '0' } });
  try {
    const response = await fetch(server.base + '/api/jobs/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobIds: reviewIds, kind: 'review' }) });
    assert.equal(response.status, 200);
    const api = await response.json();
    assert.deepEqual(api.events, review.events);
    assert.deepEqual(api.skipped, review.skipped);
    assert.deepEqual(await fs.readFile(store.DB_PATH), before);
  } finally { await server.stop(); }
});
