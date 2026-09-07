import { useMemo, useState } from 'react';
import { api, STATUSES, daysAgo, scoreColor } from '../api.js';

function JobCard({ job, selected, toggleSel, openDetail, onDragStart }) {
  const applied = job.status === 'applied' && daysAgo(job.appliedAt) != null;
  const staleDays = applied ? daysAgo(job.appliedAt) : null;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job.id)}
      onClick={() => openDetail(job.id)}
      className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900 p-2.5 transition-colors hover:border-indigo-600"
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 accent-indigo-500"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(job.id)}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100" title={job.title}>{job.title}</p>
          <p className="truncate text-xs text-indigo-300">{job.company || '—'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            {job.location && <span className="truncate max-w-32">📍 {job.location}</span>}
            <span>{job.source}</span>
            {job.tailored && <span title="CV y carta generados">📄</span>}
            {staleDays != null && (
              <span className={staleDays > 12 ? 'font-semibold text-amber-400' : ''}>hace {staleDays}d</span>
            )}
          </div>
        </div>
        {job.score != null && (
          <span className={`chip shrink-0 ${scoreColor(job.score)}`}>{job.score}</span>
        )}
      </div>
    </div>
  );
}

export default function PipelineTab({ jobs, replaceJob, openDetail, notify }) {
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(null); // {label, done, total}

  const filtered = useMemo(() => {
    if (!filter.trim()) return jobs;
    const f = filter.toLowerCase();
    return jobs.filter((j) =>
      [j.title, j.company, j.location, j.tags?.join(' '), j.notes].join(' ').toLowerCase().includes(f)
    );
  }, [jobs, filter]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
    for (const j of filtered) (map[j.status] || map.inbox).push(j);
    // dentro de cada columna: mayor score primero, sin score al final
    for (const col of Object.values(map)) {
      col.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return map;
  }, [filtered]);

  const toggleSel = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleColumn = (colJobs) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = colJobs.every((j) => next.has(j.id));
      for (const j of colJobs) allIn ? next.delete(j.id) : next.add(j.id);
      return next;
    });
  };

  const onDragStart = (e, id) => e.dataTransfer.setData('text/jobid', id);
  const onDrop = async (e, status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/jobid');
    if (!id) return;
    try {
      replaceJob(await api.patchJob(id, { status }));
    } catch (err) {
      notify(err.message);
    }
  };

  // ---- Operaciones en lote (secuenciales para respetar rate limits del free tier) ----
  const runBatch = async (label, fn) => {
    const ids = [...selected];
    setBusy({ label, done: 0, total: ids.length });
    const errors = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        const job = await fn(ids[i]);
        if (job) replaceJob(job);
      } catch (e) {
        errors.push(e.message);
      }
      setBusy({ label, done: i + 1, total: ids.length });
    }
    setBusy(null);
    setSelected(new Set());
    if (errors.length) notify(`${errors.length} fallos: ${errors[0]}`);
    else notify(`${label}: ${ids.length} ofertas listas ✓`, 'info');
  };

  const batchScore = () => runBatch('Puntuar', (id) => api.score(id));
  const batchTailor = () => runBatch('Generar CV+carta', (id) => api.tailor(id));
  const batchApplied = () => runBatch('Marcar aplicadas', (id) => api.patchJob(id, { status: 'applied' }));
  const batchDiscard = () => runBatch('Descartar', (id) => api.patchJob(id, { status: 'discarded' }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-2">
        <input
          className="input max-w-xs"
          placeholder="Filtrar por texto, empresa, skill…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="text-xs text-slate-500">{filtered.length} ofertas · arrastra las tarjetas entre columnas</span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {STATUSES.map((s) => (
          <div
            key={s.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, s.id)}
            className="flex w-64 shrink-0 flex-col rounded-2xl border border-slate-800/70 bg-slate-900/40"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="ml-auto text-xs text-slate-500">{byStatus[s.id].length}</span>
              {byStatus[s.id].length > 0 && (
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  title="Seleccionar toda la columna"
                  checked={byStatus[s.id].every((j) => selected.has(j.id))}
                  onChange={() => toggleColumn(byStatus[s.id])}
                />
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {byStatus[s.id].map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  selected={selected.has(j.id)}
                  toggleSel={toggleSel}
                  openDetail={openDetail}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {(selected.size > 0 || busy) && (
        <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2.5">
          {busy ? (
            <>
              <span className="text-sm font-medium text-indigo-300">
                🤖 {busy.label}… {busy.done}/{busy.total}
              </span>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${(busy.done / busy.total) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-300">{selected.size} seleccionadas:</span>
              <button className="btn-ghost text-xs" onClick={batchScore}>🎯 Puntuar encaje</button>
              <button className="btn-primary text-xs" onClick={batchTailor}>📄 Generar CV + carta</button>
              <button className="btn-ghost text-xs" onClick={batchApplied}>✓ Marcar aplicadas</button>
              <button className="btn-danger text-xs" onClick={batchDiscard}>✕ Descartar</button>
              <button className="btn-ghost text-xs ml-auto" onClick={() => setSelected(new Set())}>Deseleccionar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
