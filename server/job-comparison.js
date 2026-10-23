import * as store from './store.js';

const unknown = 'Por confirmar';
const columns = [
  ['company', 'Empresa'], ['context', 'Búsqueda'], ['location', 'Ubicación'],
  ['workMode', 'Modalidad'], ['salary', 'Salario publicado'], ['salaryRange', 'Rango guardado'],
  ['status', 'Estado'], ['score', 'Encaje guardado'], ['nextActionAt', 'Próxima revisión'],
  ['interviewAt', 'Entrevista'], ['notes', 'Notas'], ['url', 'Fuente'],
].map(([key, label]) => ({key, label}));
const modes = {remote:'Remoto', hybrid:'Híbrido', onsite:'Presencial'};
const statuses = {inbox:'Pendiente', interested:'Me interesa', tailored:'CV listo', applied:'Enviada',
  answered:'En proceso', interview:'Entrevista', offer:'Oferta', rejected:'Rechazada', discarded:'Descartada'};
const date = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('es-ES', {dateStyle:'medium', timeStyle:'short'}) : unknown;
const present = value => typeof value === 'string' && value.trim() ? value : unknown;
function salaryRange(job) {
  const number = new Intl.NumberFormat('es-ES', {maximumFractionDigits:2});
  const min = Number.isFinite(job.salaryMin) ? number.format(job.salaryMin) : null;
  const max = Number.isFinite(job.salaryMax) ? number.format(job.salaryMax) : null;
  if (min === null && max === null) return unknown;
  return `${min !== null && max !== null ? `${min}–${max}` : min !== null ? `Desde ${min}` : `Hasta ${max}`} ${job.salaryCurrency || unknown} / ${{year:'año',month:'mes',hour:'hora'}[job.salaryPeriod] || unknown}`;
}

export function compareJobs(ids) {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw Error('Selecciona al menos dos ofertas distintas.');
  const jobs = unique.map(id => {
    const job = store.getJob(id);
    if (!job) throw Error(`La oferta ${id} no existe.`);
    return {id:job.id, title:job.title, company:job.company, contextId:job.contextId,
      values:{company:present(job.company), context:store.getContext(job.contextId)?.name || unknown,
        location:present(job.location), workMode:modes[job.workMode] || unknown,
        salary:present(job.salary), salaryRange:salaryRange(job), status:statuses[job.status] || job.status || unknown,
        score:Number.isFinite(job.score) ? `${job.score}/100` : unknown,
        nextActionAt:date(job.nextActionAt), interviewAt:date(job.interviewAt), notes:present(job.notes), url:present(job.url)},
      salary:{published:job.salary || null, min:job.salaryMin ?? null, max:job.salaryMax ?? null,
        currency:job.salaryCurrency ?? null, period:job.salaryPeriod ?? null}};
  });
  const note = 'Datos guardados de cada oferta. Los salarios conservan moneda y periodo; no se convierten ni se ordenan. El encaje es una valoración previa, no una nueva evaluación.';
  const text = ['Comparativa de ofertas', note, '', ...jobs.flatMap(job => [job.title,
    ...columns.map(column => `${column.label}: ${job.values[column.key]}`), ''])].join('\n');
  return {columns, jobs, note, text};
}
