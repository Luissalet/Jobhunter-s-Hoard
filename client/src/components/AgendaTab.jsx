import { useMemo, useState } from 'react';
import { api, daysAgo, statusLabel } from '../api.js';

function Row({ job, openDetail, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openDetail(job.id)}>
        <p className="truncate text-sm font-semibold text-slate-100">{job.title}</p>
        <p className="truncate text-xs text-indigo-300">
          {job.company} · <span className="text-slate-500">{statusLabel(job.status)}</span>
          {job.appliedAt && <span className="text-slate-500"> · aplicada hace {daysAgo(job.appliedAt)}d</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{children}</div>
    </div>
  );
}

export default function AgendaTab({ jobs, replaceJob, openDetail, notify }) {
  const [busyId, setBusyId] = useState(null);
  const now = Date.now();
  const in14d = now + 14 * 86400000;

  const followupsDue = useMemo(
    () =>
      jobs
        .filter((j) => j.nextActionAt && new Date(j.nextActionAt).getTime() <= now && !['rejected', 'discarded', 'offer'].includes(j.status))
        .sort((a, b) => new Date(a.nextActionAt) - new Date(b.nextActionAt)),
    [jobs, now]
  );

  const upcoming = useMemo(
    () =>
      jobs
        .filter((j) => j.interviewAt && new Date(j.interviewAt).getTime() >= now - 86400000 && new Date(j.interviewAt).getTime() <= in14d)
        .sort((a, b) => new Date(a.interviewAt) - new Date(b.interviewAt)),
    [jobs, now, in14d]
  );

  const future = useMemo(
    () =>
      jobs
        .filter((j) => j.nextActionAt && new Date(j.nextActionAt).getTime() > now && !['rejected', 'discarded'].includes(j.status))
        .sort((a, b) => new Date(a.nextActionAt) - new Date(b.nextActionAt))
        .slice(0, 10),
    [jobs, now]
  );

  const patch = async (id, body) => {
    try {
      replaceJob(await api.patchJob(id, body));
    } catch (e) {
      notify(e.message);
    }
  };

  const draftFollowup = async (job) => {
    setBusyId(job.id);
    try {
      replaceJob(await api.followup(job.id, job.lang));
      openDetail(job.id);
      notify('Borrador de follow-up listo — revísalo en el panel ', 'info');
    } catch (e) {
      notify(e.message);
    }
    setBusyId(null);
  };

  const postpone = (job, days) =>
    patch(job.id, { nextActionAt: new Date(now + days * 86400000).toISOString() });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <section>
          <h2 className="mb-2 font-bold"> Follow-ups pendientes ({followupsDue.length})</h2>
          {followupsDue.length === 0 ? (
            <p className="text-sm text-slate-500">Nada pendiente. Al marcar una oferta como aplicada, se programa un follow-up automático a los 10 días.</p>
          ) : (
            <div className="space-y-2">
              {followupsDue.map((j) => (
                <Row key={j.id} job={j} openDetail={openDetail}>
                  <button className="btn-primary text-xs" disabled={busyId === j.id} onClick={() => draftFollowup(j)}>
                    {busyId === j.id ? ' Redactando…' : ' Redactar follow-up'}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => postpone(j, 5)}>＋5 días</button>
                  <button className="btn-ghost text-xs" onClick={() => patch(j.id, { nextActionAt: null })}> Hecho</button>
                </Row>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-bold"> Entrevistas próximas ({upcoming.length})</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Sin entrevistas programadas. Ponles fecha desde el detalle de cada oferta.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((j) => (
                <Row key={j.id} job={j} openDetail={openDetail}>
                  <span className="chip bg-emerald-900/60 text-emerald-300">
                    {new Date(j.interviewAt).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {j.interviewPrep ? (
                    <a href={`/api/jobs/${j.id}/prep.html`} target="_blank" rel="noopener" className="btn-ghost text-xs"> Ver prep</a>
                  ) : (
                    <button className="btn-primary text-xs" onClick={() => openDetail(j.id)}>Preparar →</button>
                  )}
                </Row>
              ))}
            </div>
          )}
        </section>

        {future.length > 0 && (
          <section>
            <h2 className="mb-2 font-bold text-slate-400"> Próximas acciones</h2>
            <div className="space-y-2 opacity-70">
              {future.map((j) => (
                <Row key={j.id} job={j} openDetail={openDetail}>
                  <span className="chip bg-slate-800 text-slate-400">
                    {new Date(j.nextActionAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </span>
                </Row>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

