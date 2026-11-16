import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-fit-'));
process.env.JOBHUNT_DATA_DIR = directory;
process.env.HOARD_HUB_URL = 'http://127.0.0.1:9';
process.env.HOARD_EVENTS = '0';
const store = await import('../server/store.js');
const { callTool } = await import('../server/agent-tools.js');
const { computeFit, gate } = await import('../server/fit-score.js');
after(() => fs.rm(directory, { recursive: true, force: true }));

const analysis = {
  verdict: 'Encaja en lo técnico, falta experiencia con el dominio.',
  criteria: [
    { requirement: 'TypeScript', importance: 'critical', evidence: 'stated', jdSignal: 'TypeScript is required', match: 'strong', cvEvidence: '5 años de TypeScript en producción' },
    { requirement: 'Kubernetes', importance: 'high', evidence: 'structural', match: 'missing', gap: 'No hay Kubernetes en el perfil', risk: 'Preguntarán por despliegues', mitigation: 'Contar el despliegue con Docker Compose' },
    { requirement: 'Sector salud', importance: 'meaningful', evidence: 'inferred', match: 'partial', cvEvidence: 'Proyecto de historia clínica en 2023' },
    { requirement: 'Inglés', importance: 'preferred', evidence: 'structural', match: 'na' },
  ],
  keywords: ['TypeScript', 'Kubernetes'],
  strengths: ['TypeScript en producción'],
  gaps: [],
};

test('the score comes from the weights, not from the model', () => {
  const fit = computeFit(analysis);
  // 5*1 + 4*0 + 3*0.5 = 6.5 sobre 5+4+3 = 12 → 54; el criterio no aplicable no pesa
  assert.equal(fit.score, 54);
  assert.equal(fit.decision, 'descartar');
  assert.equal(fit.criteria.find((c) => c.requirement === 'Inglés').weight, 2);
  assert.equal(fit.criteria.find((c) => c.requirement === 'Inglés').value, null);
  assert.deepEqual(fit.blocking.map((b) => b.requirement), ['Kubernetes']);
  assert.match(fit.plan.join('\n'), /Kubernetes/);
  assert.match(fit.plan.join('\n'), /TypeScript/);
});

test('a market guess cannot be critical and a stated weight needs its quote', () => {
  const guessed = gate({ requirement: 'Go', importance: 'critical', evidence: 'inferred', match: 'missing' });
  assert.equal(guessed.importance, 'meaningful');
  assert.equal(guessed.downgraded, true);
  const unquoted = gate({ requirement: 'Go', importance: 'high', evidence: 'stated', jdSignal: '  ', match: 'strong' });
  assert.equal(unquoted.evidence, 'structural');
  assert.equal(unquoted.downgraded, true);
  const quoted = gate({ requirement: 'Go', importance: 'critical', evidence: 'stated', jdSignal: 'Go is required', match: 'strong' });
  assert.equal(quoted.importance, 'critical');
  assert.equal(quoted.downgraded, undefined);
});

test('a strong fit reaches the apply band and a blocking gap is reported', () => {
  const fit = computeFit({
    criteria: [
      { requirement: 'TypeScript', importance: 'critical', evidence: 'stated', jdSignal: 'required', match: 'strong' },
      { requirement: 'React', importance: 'high', evidence: 'structural', match: 'strong' },
      { requirement: 'Testing', importance: 'meaningful', evidence: 'structural', match: 'partial' },
    ],
  });
  assert.equal(fit.score, 88);
  assert.equal(fit.decision, 'aplicar');
  assert.deepEqual(fit.blocking, []);
  assert.match(fit.plan.join('\n'), /palabras clave|Abrir el CV/);
});

test('all criteria not applicable is an error, not a zero', () => {
  assert.throws(
    () => computeFit({ criteria: [{ requirement: 'Inglés', match: 'na' }] }),
    /no aplicables/,
  );
});

test('the fit is stored on the job, readable, ranked and served over HTTP and MCP', async () => {
  const strong = store.addJob({ title: 'Puesto fuerte', company: 'Empresa ficticia A' });
  const weak = store.addJob({ title: 'Puesto flojo', company: 'Empresa ficticia B' });
  const saved = await callTool('score_job_fit', { jobId: strong.id, analysis });
  assert.equal(saved.fit.score, 54);
  assert.equal(saved.score, 54);
  assert.equal(saved.scoreDetails.verdict, analysis.verdict);
  await callTool('score_job_fit', {
    jobId: weak.id,
    analysis: { criteria: [{ requirement: 'TypeScript', importance: 'critical', evidence: 'stated', jdSignal: 'required', match: 'strong' }] },
  });
  const read = await callTool('get_job_fit', { jobId: strong.id });
  assert.equal(read.fit.criteria.length, 4);
  const ranked = await callTool('rank_jobs_by_fit', {});
  assert.deepEqual(ranked.jobs.map((j) => j.id), [weak.id, strong.id]);
  assert.equal(ranked.jobs[0].score, 100);
  await assert.rejects(callTool('get_job_fit', { jobId: 'missing' }), /no existe/);
  await assert.rejects(
    callTool('score_job_fit', { jobId: strong.id, analysis: { criteria: [] } }),
    /criteria|too_small|Array must contain/i,
  );

  const server = await startServer({ data: directory, env: { HOARD_EVENTS: '0' } });
  try {
    const fitResponse = await fetch(`${server.base}/api/jobs/${strong.id}/fit`);
    assert.equal(fitResponse.status, 200);
    assert.equal((await fitResponse.json()).fit.score, 54);
    const rankResponse = await fetch(`${server.base}/api/jobs/fit/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(rankResponse.status, 200);
    assert.equal((await rankResponse.json()).jobs.length, 2);
    const tools = await fetch(`${server.base}/api/agent/tools`, {
      headers: { Authorization: `Bearer ${await fs.readFile(path.join(directory, 'mcp-token'), 'utf8')}` },
    });
    const catalogue = await tools.json();
    const names = (catalogue.tools || []).map((t) => t.name);
    for (const name of ['score_job_fit', 'get_job_fit', 'rank_jobs_by_fit'])
      assert.ok(names.includes(name), `${name} is in the MCP catalogue`);
  } finally {
    await server.stop();
  }
});