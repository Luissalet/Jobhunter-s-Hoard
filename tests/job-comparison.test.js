import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startServer} from './helpers.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-compare-'));
process.env.JOBHUNT_DATA_DIR = directory;
process.env.HOARD_HUB_URL = 'http://127.0.0.1:9';
process.env.HOARD_EVENTS = '0';
const store = await import('../server/store.js');
const {callTool} = await import('../server/agent-tools.js');
after(() => fs.rm(directory, {recursive:true, force:true}));

test('comparison preserves selected order, salary units and unknown facts without changing the record', async () => {
  const first = store.addJob({title:'Oferta anual',company:'Empresa ficticia A',salaryMin:40000,salaryMax:50000,
    salaryCurrency:'EUR',salaryPeriod:'year',workMode:'remote'});
  const second = store.addJob({title:'Oferta mensual',company:'Empresa ficticia B',salaryMin:3500,
    salaryCurrency:'USD',salaryPeriod:'month'});
  const third = store.addJob({title:'Sin salario'});
  store.updateJob(first.id, {score:0,notes:'Nota\ncon segunda línea'});
  const before = await fs.readFile(store.DB_PATH);
  const args = {jobIds:[second.id,first.id,third.id,first.id]};
  const result = await callTool('compare_jobs', args);
  assert.deepEqual(result.jobs.map(job=>job.id),[second.id,first.id,third.id]);
  assert.match(result.jobs[0].values.salaryRange,/3500 USD \/ mes/);
  assert.match(result.jobs[1].values.salaryRange,/40\.000–50\.000 EUR \/ año/);
  assert.equal(result.jobs[1].values.score,'0/100');
  assert.equal(result.jobs[2].values.salaryRange,'Por confirmar');
  assert.equal(result.jobs[0].values.workMode,'Por confirmar');
  assert.ok(result.text.includes('Nota\ncon segunda línea'));
  assert.deepEqual(await fs.readFile(store.DB_PATH), before);
  await assert.rejects(callTool('compare_jobs',{jobIds:[first.id,first.id]}),/dos ofertas distintas/);
  await assert.rejects(callTool('compare_jobs',{jobIds:[first.id,'missing']}),/no existe/);
  const server = await startServer({data:directory,env:{HOARD_EVENTS:'0'}});
  try {
    const response = await fetch(server.base+'/api/jobs/compare',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),result);
    assert.deepEqual(await fs.readFile(store.DB_PATH),before);
  } finally { await server.stop(); }
});
