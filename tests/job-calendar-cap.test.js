import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServer, root } from './helpers.js';
import { capResult } from '../server/hoard-commons/express.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-calendar-cap-'));
process.env.JOBHUNT_DATA_DIR = directory;
process.env.HOARD_EVENTS = '0';
process.env.HOARD_HUB_URL = 'http://127.0.0.1:9';
const store = await import('../server/store.js');
const { callTool } = await import('../server/agent-tools.js');
const { exportJobCalendar } = await import('../server/job-calendar.js');
after(() => fs.rm(directory, { recursive: true, force: true }));

test('calendar snapshots over 500KB remain complete through native HTTP and real SDK; ordinary results still cap', async () => {
  const ordinary = { rows: Array(100).fill('ordinary row '.repeat(10)), text: 'ordinary'.repeat(100) };
  const original = JSON.stringify(ordinary);
  assert.ok(capResult(ordinary, 1000).truncated);
  assert.equal(JSON.stringify(ordinary), original);
  const marked = { __uncapped: true, ...ordinary };
  assert.deepEqual(capResult(marked, 1000), ordinary);
  assert.equal(marked.__uncapped, true);
  assert.notEqual(capResult(marked, 1000), marked);
  const template = store.addJob({ title: 'Oferta técnica con análisis y coordinación · '.repeat(3), company: 'Empresa ficticia del calendario' });
  const jobs = Array.from({ length: 1100 }, (_, index) => ({ ...template, id: `calendar-large-${index}`, interviewAt: '2026-10-25T02:30:00+02:00' }));
  store.importAll({ ...store.exportAll(), jobs });
  const args = { jobIds: jobs.map(job => job.id), kind: 'interview' };
  const expected = exportJobCalendar(args.jobIds, args.kind);
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) > 500000);
  assert.ok(!Object.hasOwn(expected, '__uncapped'));
  const native = await callTool('export_job_calendar', args);
  assert.equal(native.__uncapped, true);
  assert.ok(!JSON.stringify(native).includes('__uncapped'));
  const before = await fs.readFile(store.DB_PATH);
  const normalize = value => ({ ...value, generatedAt: 'STAMP', ics: value.ics.replace(/^DTSTAMP:.*\r\n/gm, 'DTSTAMP:STAMP\r\n') });
  const server = await startServer({ data: directory, env: { HOARD_EVENTS: '0' } });
  const client = new Client({ name: 'large-calendar-regression', version: '1' });
  try {
    const response = await fetch(server.base + '/api/jobs/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    assert.equal(response.status, 200);
    const api = await response.json();
    assert.equal(api.events.length, 1100);
    assert.ok(!Object.hasOwn(api, '__uncapped') && !api.truncated);
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server/mcp.js')], env: { ...process.env, JOBHUNT_URL: server.base, HOARD_EVENTS: '0' }, stderr: 'pipe' });
    await client.connect(transport);
    const out = await client.callTool({ name: 'export_job_calendar', arguments: args });
    assert.ok(!out.isError);
    const mcp = JSON.parse(out.content[0].text);
    assert.deepEqual(normalize(mcp), normalize(api));
    assert.deepEqual(normalize(mcp), normalize(expected));
    assert.equal((mcp.ics.match(/BEGIN:VEVENT\r\n/g) || []).length, 1100);
    assert.ok(!Object.hasOwn(mcp, '__uncapped') && !mcp.truncated);
    if (process.env.JOBCALENDAR_TEST_EVIDENCE) {
      await fs.writeFile(path.join(process.env.JOBCALENDAR_TEST_EVIDENCE, 'large-api.json'), JSON.stringify(api));
      await fs.writeFile(path.join(process.env.JOBCALENDAR_TEST_EVIDENCE, 'large-mcp.json'), JSON.stringify(mcp));
    }
    assert.deepEqual(await fs.readFile(store.DB_PATH), before);
  } finally { await client.close(); await server.stop(); }
});
