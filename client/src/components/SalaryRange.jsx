import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { changedFields, rebaseForm } from '../copilot-context.js';
import { useCopilotContext } from '../copilot-hooks.js';
import { Field } from './WorkspaceTab.jsx';

export const salaryForm = job => ({ salaryMin: job.salaryMin == null ? '' : String(job.salaryMin), salaryMax: job.salaryMax == null ? '' : String(job.salaryMax), salaryCurrency: job.salaryCurrency ?? '', salaryPeriod: job.salaryPeriod ?? '' });
const values = form => ({ ...form, salaryMin: form.salaryMin === '' ? null : Number(form.salaryMin), salaryMax: form.salaryMax === '' ? null : Number(form.salaryMax) });
export const salaryPatch = (base, form) => changedFields(values(base), values(form));
export function acknowledgeSalary(current, submitted, saved) {
  return Object.fromEntries(Object.keys(current).map(key => [key, current[key] === submitted[key] ? saved[key] : current[key]]));
}
const periods = { year: 'año', month: 'mes', hour: 'hora' };
export function salaryLabel(job) {
  const min = job.salaryMin, max = job.salaryMax;
  if (min == null && max == null) return 'Por confirmar';
  return `${min != null && max != null ? `${min}–${max}` : min != null ? `Desde ${min}` : `Hasta ${max}`} ${job.salaryCurrency || 'moneda por confirmar'} / ${periods[job.salaryPeriod] || 'periodo por confirmar'}`;
}

export default function SalaryRange({ job, refresh, onPending }) {
  const [form, setForm] = useState(() => salaryForm(job));
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const base = useRef(salaryForm(job)), live = useRef(true);
  const dirty = Object.keys(salaryPatch(base.current, form));
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const next = salaryForm(job), previous = base.current;
    base.current = next;
    setForm(current => rebaseForm(previous, next, current));
  }, [job.id, job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod]);
  useEffect(() => { onPending(editing && dirty.length > 0 || busy); }, [editing, dirty.length, busy, onPending]);
  useEffect(() => () => onPending(false), [onPending]);
  useCopilotContext(() => ({ editors: editing ? [{ kind: 'job-salary', object_id: job.id, dirty: dirty.length > 0, changed: dirty, fields: { ...form } }] : [] }));
  const edit = (name, value) => { setForm(current => ({ ...current, [name]: value })); setError(''); setMessage(''); };
  const save = async event => {
    event.preventDefault();
    const submitted = { ...form }, patch = salaryPatch(base.current, submitted);
    if (busy || !Object.keys(patch).length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await api.saveJobFacts(job.id, patch);
      if (live.current) {
        const next = salaryForm(saved);
        base.current = next;
        setForm(current => acknowledgeSalary(current, submitted, next));
        setMessage('Rango guardado. Los datos enviados ya están registrados.');
      }
      try { await refresh(); }
      catch { if (live.current) setMessage('Rango guardado. No se pudo recargar la candidatura; los cambios enviados siguen registrados.'); }
    } catch (cause) { if (live.current) setError(cause.message); }
    finally { if (live.current) setBusy(false); }
  };
  return <section aria-label="Rango salarial guardado">
    <div className="section-heading"><h3>Rango salarial guardado</h3>{!editing && <button className="btn-ghost" onClick={() => {setForm(salaryForm(job)); base.current = salaryForm(job); setEditing(true); setError(''); setMessage('');}}>Editar rango</button>}</div>
    <p>{salaryLabel(job)}</p>
    <p className="supporting-copy">Datos confirmados de la oferta, independientes del salario publicado. No se estiman ni se convierten monedas o periodos.</p>
    {editing && <form className="inline-panel" onSubmit={save}>
      <div className="form-grid">
        <Field label="Mínimo guardado" type="number" min="0" step="any" value={form.salaryMin} onChange={e => edit('salaryMin', e.target.value)} hint="Vacío: desconocido. Cero se guarda como cero." />
        <Field label="Máximo guardado" type="number" min="0" step="any" value={form.salaryMax} onChange={e => edit('salaryMax', e.target.value)} />
        <Field label="Código de moneda" required minLength="3" maxLength="3" value={form.salaryCurrency} onChange={e => edit('salaryCurrency', e.target.value)} hint="Tres caracteres, por ejemplo EUR o USD." />
        <Field label="Periodo"><select value={form.salaryPeriod} onChange={e => edit('salaryPeriod', e.target.value)} required><option value="">Por confirmar</option>{Object.entries(periods).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      </div>
      <p className="supporting-copy">Actualizar hechos conserva los documentos y deja sin vigencia su revisión previa. No se puede modificar un intento en curso.</p>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <div className="form-actions"><button className="btn-primary" disabled={busy || !dirty.length}>{busy ? 'Guardando rango…' : 'Guardar rango'}</button><button className="btn-ghost" type="button" disabled={busy} onClick={() => { setEditing(false); setForm(salaryForm(job)); setError(''); setMessage(''); }}>Cerrar editor de rango</button></div>
    </form>}
  </section>;
}
