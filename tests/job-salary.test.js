import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
import {buildContext} from '../client/src/copilot-context.js';

test('salary edits preserve zero/null, partial fields and later draft; native facts and final context retain units',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'job-salary-'));
  process.env.JOBHUNT_DATA_DIR=directory;process.env.HOARD_EVENTS='0';process.env.HOARD_HUB_URL='http://127.0.0.1:9';
  try {
    const code=buildSync({entryPoints:[path.resolve('client/src/components/SalaryRange.jsx')],bundle:true,write:false,platform:'node',format:'cjs',external:['react']}).outputFiles[0].text;
    const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:createRequire(import.meta.url)});
    const {salaryForm,salaryPatch,acknowledgeSalary,salaryLabel}=module.exports;
    const store=await import('../server/store.js');const {callTool}=await import('../server/agent-tools.js');
    const a=store.addJob({title:'Mensual QA',salary:'Texto publicado intacto',salaryMin:2500,salaryMax:3200,salaryCurrency:'USD',salaryPeriod:'month'});
    const b=store.addJob({title:'Anual QA',salaryMin:40000,salaryMax:50000,salaryCurrency:'EUR',salaryPeriod:'year'});
    const other=structuredClone(b), original=structuredClone(a);
    const base=salaryForm(a), submitted={...base,salaryMin:'',salaryMax:'0'};
    assert.deepEqual(JSON.parse(JSON.stringify(salaryPatch(base,submitted))),{salaryMin:null,salaryMax:0});
    const saved=await callTool('update_job_facts',{jobId:a.id,...salaryPatch(base,submitted)});
    assert.equal(saved.salaryMin,null);assert.equal(saved.salaryMax,0);assert.equal(saved.salaryCurrency,'USD');assert.equal(saved.salaryPeriod,'month');
    const later={...submitted,salaryMax:'3300'};
    const ack=acknowledgeSalary(later,submitted,salaryForm(saved));assert.equal(ack.salaryMax,'3300');assert.equal(ack.salaryMin,'');
    assert.equal(salaryLabel({...saved,salaryMax:null}),'Por confirmar');assert.match(salaryLabel(saved),/Hasta 0 USD \/ mes/);
    assert.deepEqual(store.getJob(b.id),other);
    for(const key of Object.keys(original).filter(k=>!['salaryMin','salaryMax','updatedAt','application'].includes(k)))assert.deepEqual(saved[key],original[key]);
    assert.deepEqual(saved.application,{...original.application,approvedDraftAt:null});
    const context=await buildContext({view:{page:'applications',job_id:a.id},editors:[{kind:'job-salary',object_id:a.id,dirty:true,fields:later}],loadState:async()=>({jobs:[saved,b],contexts:[],activeContextId:null})});
    const object=context.active_objects.find(o=>o.object_id===a.id);assert.equal(object.salaryMin,null);assert.equal(object.salaryMax,0);assert.equal(object.salaryCurrency,'USD');assert.equal(object.salaryPeriod,'month');
    assert.equal(context.view.editor.fields.salaryMax,'3300');assert.equal(context.view.editor.fields.salaryMin,'');
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
