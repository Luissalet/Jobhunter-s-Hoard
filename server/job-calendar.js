import { createHash } from 'node:crypto';
import * as store from './store.js';

// An offset is an instant; a stored time without an offset remains floating.
export function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/i.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00', zone] = match;
  const y = +year, m = +month, d = +day;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!y || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return null;
  if (hour === undefined) return { type: 'date', start: value, ical: value.replaceAll('-', '') };
  if (+hour > 23 || +minute > 59 || +second > 59) return null;
  const local = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (!zone) return { type: 'floating', start: local, ical: local.replaceAll('-', '').replaceAll(':', '') };
  if (zone !== 'Z' && zone !== 'z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
  const ms = Date.parse(local + zone.toUpperCase());
  if (!Number.isFinite(ms)) return null;
  const utc = new Date(ms).toISOString();
  if (!/^\d{4}-/.test(utc) || utc.startsWith('0000')) return null;
  const start = utc.slice(0, 19) + 'Z';
  return { type: 'utc', start, ical: start.replaceAll('-', '').replaceAll(':', '') };
}

const text = (value) => String(value ?? '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
function fold(line) {
  const lines = []; let part = '', bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 75) { lines.push(part); part = ' '; bytes = 1; }
    part += character; bytes += size;
  }
  lines.push(part); return lines.join('\r\n');
}
function sourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function exportJobCalendar(ids, kind, now = new Date()) {
  const field = kind === 'interview' ? 'interviewAt' : 'nextActionAt';
  const label = kind === 'interview' ? 'Entrevista' : 'Revisión de candidatura';
  const generatedAt = now.toISOString();
  const events = [], skipped = [];
  for (const id of new Set(ids)) {
    const job = store.getJob(id);
    if (!job) { skipped.push({ jobId: id, reason: 'not_found' }); continue; }
    const raw = job[field];
    const date = calendarDate(raw);
    if (!date) { skipped.push({ jobId: id, title: job.title, reason: raw ? 'invalid_date' : 'missing_date' }); continue; }
    const uid = createHash('sha256').update(`${job.id}\0${kind}`).digest('hex') + '@jobhunter.local';
    const title = `${label}: ${job.title || 'Puesto por confirmar'} · ${job.company || 'Empresa por confirmar'}`;
    events.push({ jobId: job.id, uid, kind, title, original: raw, type: date.type, start: date.start, icalStart: date.ical, url: sourceUrl(job.url) });
  }
  const stamp = generatedAt.slice(0, 19).replaceAll('-', '').replaceAll(':', '') + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Jobhunter's Hoard//Seguimiento//ES", 'CALSCALE:GREGORIAN'];
  for (const event of events) lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${stamp}`,
    `${event.type === 'date' ? 'DTSTART;VALUE=DATE' : 'DTSTART'}:${event.icalStart}`,
    `SUMMARY:${text(event.title)}`, 'TRANSP:TRANSPARENT', ...(event.url ? [`URL:${event.url}`] : []), 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return { kind, generatedAt, events, skipped, ics: lines.map(fold).join('\r\n') + '\r\n' };
}
