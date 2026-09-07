import { useState } from 'react';
import { api, STATUSES, daysAgo, scoreColor } from '../api.js';

function toDateInput(iso) {
  return iso ? iso.slice(0, 10) : '';
}
function toDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function JobDetail({ job, close, replaceJob, removeJob, notify }) {
  const [scoring, setScoring] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [prepping, setPrepping] = useState(false);
  const [lang, setLang] = useState(job.tailored?.lang || job.lang || 'es');
  const [notes, setNotes] = useState(job.notes || '');

  const patch = async (body) => {
    try {
      replaceJob(await api.patchJob(job.id, body));
    } catch (e) {
      notify(e.message);
    }
  };

  const doScore = async () => {
    setScoring(true);
    try {
      replaceJob(await api.score(job.id));
    } catch (e) { notify(e.message); }
    setScoring(false);
  };

  const doTailor = async () => {
    setTailoring(true);
    try {
      replaceJob(await api.tailor(job.id, lang));
      notify('CV y carta generados ✓', 'info');
    } catch (e) { notify(e.message); }
    setTailoring(false);
  };

  const doFollowup = async () => {
    setFollowingUp(true);
    try {
      replaceJob(await api.followup(job.id, lang));
      notify('Borrador de follow-up generado ✓', 'info');
    } catch (e) { notify(e.message); }
    setFollowingUp(false);
  };

  const doPrep = async () => {
    setPrepping(true);
    try {
      replaceJob(await api.prep(job.id, lang));
      notify('Preparación de entrevista generada ✓', 'info');
    } catch (e) { notify(e.message); }
    setPrepping(false);
  };

  const copyFollowup = async () => {
    const f = job.followup;
    await navigator.clipboard.writeText(`Asunto: ${f.subject}\n\n${f.body}`);
    notify('Copiado al portapapeles ✓', 'info');
  };

  const doDelete = async () => {
    if (!window.confirm('¿Eliminar esta oferta del tracker?')) return;
    try {
      await api.deleteJob(job.id);
      removeJob(job.id);
    } catch (e) { notify(e.message); }
  };

  const d = job.scoreDetails;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/50" onClick={close}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold leading-tight text-slate-100">{job.title}</h2>
              <p className="text-sm text-indigo-300">{job.company}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                {job.location && <span>📍 {job.location}</span>}
                {job.salary && <span>💰 {job.salary}</span>}
                <span>{job.source}</span>
                <span>añadida hace {daysAgo(job.createdAt)}d</span>
                {job.appliedAt && <span className="text-indigo-300">aplicada hace {daysAgo(job.appliedAt)}d</span>}
              </div>
            </div>
            {job.score != null && (
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold ${scoreColor(job.score)}`}>
                {job.score}
              </div>
            )}
            <button className="btn-ghost shrink-0 px-2" onClick={close}>✕</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="input w-auto text-xs"
              value={job.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {job.applyUrl && (
              <a href={job.applyUrl} target="_blank" rel="noopener" className="btn-primary text-xs">↗ Abrir oferta</a>
            )}
            {job.status !== 'applied' && (
              <button className="btn-ghost text-xs" onClick={() => patch({ status: 'applied' })}>✓ Marcar aplicada</button>
            )}
            <button className="btn-danger text-xs ml-auto" onClick={doDelete}>🗑</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* Encaje */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">🎯 Encaje con tu perfil</h3>
              <button className="btn-ghost ml-auto text-xs" disabled={scoring} onClick={doScore}>
                {scoring ? '🤖 Analizando…' : d ? 'Repuntuar' : 'Puntuar'}
              </button>
            </div>
            {d ? (
              <div className="mt-2 space-y-2 text-sm">
                {d.verdict && <p className="italic text-slate-300">"{d.verdict}"</p>}
                {d.strengths?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-400">Puntos fuertes</p>
                    <ul className="ml-4 list-disc text-xs text-slate-300">
                      {d.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {d.gaps?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-400">Carencias / riesgos</p>
                    <ul className="ml-4 list-disc text-xs text-slate-300">
                      {d.gaps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {d.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {d.keywords.map((k) => <span key={k} className="chip bg-indigo-950 text-indigo-300">{k}</span>)}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Analiza el encaje real entre la oferta y tu perfil antes de invertir tiempo.</p>
            )}
          </section>

          {/* CV + carta */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">📄 CV y carta adaptados</h3>
              <select className="input ml-auto w-auto text-xs" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
              <button className="btn-primary text-xs" disabled={tailoring} onClick={doTailor}>
                {tailoring ? '🤖 Generando…' : job.tailored ? 'Regenerar' : 'Generar'}
              </button>
            </div>
            {job.tailored ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={`/api/jobs/${job.id}/cv.html`} target="_blank" rel="noopener" className="btn-ghost text-xs">
                  📄 Ver CV (imprimir → PDF)
                </a>
                <a href={`/api/jobs/${job.id}/letter.html`} target="_blank" rel="noopener" className="btn-ghost text-xs">
                  ✉ Ver carta
                </a>
                <span className="text-[11px] text-slate-500">
                  {job.tailored.lang} · {new Date(job.tailored.generatedAt).toLocaleString()}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Genera un CV de 1 página y una carta específicos para esta oferta a partir de tu perfil. Nunca inventa experiencia.
              </p>
            )}
          </section>

          {/* Fechas */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h3 className="font-semibold">📅 Fechas</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="text-slate-400">Próxima acción (follow-up)</span>
                <input
                  type="date"
                  className="input mt-1"
                  value={toDateInput(job.nextActionAt)}
                  onChange={(e) => patch({ nextActionAt: e.target.value ? new Date(e.target.value + 'T09:00').toISOString() : null })}
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-400">Entrevista</span>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={toDateTimeInput(job.interviewAt)}
                  onChange={(e) => patch({ interviewAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Al marcar como aplicada se programa follow-up automático a 10 días. Todo lo vencido aparece en la pestaña 📅 Hoy.
            </p>
          </section>

          {/* Follow-up */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">✉ Email de follow-up</h3>
              <button className="btn-ghost ml-auto text-xs" disabled={followingUp} onClick={doFollowup}>
                {followingUp ? '🤖 Redactando…' : job.followup ? 'Regenerar' : 'Redactar'}
              </button>
            </div>
            {job.followup ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-200">Asunto: {job.followup.subject}</p>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-950 p-2.5 font-sans text-xs leading-relaxed text-slate-300">{job.followup.body}</pre>
                <div className="mt-2 flex gap-2">
                  <button className="btn-ghost text-xs" onClick={copyFollowup}>📋 Copiar</button>
                  <a
                    className="btn-ghost text-xs"
                    href={`mailto:?subject=${encodeURIComponent(job.followup.subject)}&body=${encodeURIComponent(job.followup.body)}`}
                  >
                    ✉ Abrir en tu email
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Genera un email breve para reactivar una candidatura sin respuesta.</p>
            )}
          </section>

          {/* Preparación de entrevista */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">🎤 Preparación de entrevista</h3>
              <button className="btn-ghost ml-auto text-xs" disabled={prepping} onClick={doPrep}>
                {prepping ? '🤖 Preparando…' : job.interviewPrep ? 'Regenerar' : 'Generar'}
              </button>
            </div>
            {job.interviewPrep ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={`/api/jobs/${job.id}/prep.html`} target="_blank" rel="noopener" className="btn-primary text-xs">
                  📖 Abrir guía completa
                </a>
                <span className="text-[11px] text-slate-500">
                  {job.interviewPrep.questions?.length || 0} preguntas · {job.interviewPrep.tough?.length || 0} incómodas ·{' '}
                  {job.interviewPrep.forInterviewer?.length || 0} para el entrevistador
                </span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Preguntas probables con respuestas basadas en tu perfil real, las preguntas incómodas que te pueden caer, y qué preguntar tú.
              </p>
            )}
          </section>

          {/* Notas */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">📝 Notas</h3>
            <textarea
              className="input h-20 resize-y text-xs"
              placeholder="Contactos, feedback de entrevistas, salario hablado…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== job.notes && patch({ notes })}
            />
          </section>

          {/* Descripción */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">Descripción</h3>
            <div className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs leading-relaxed text-slate-300">
              {job.description || 'Sin descripción'}
            </div>
          </section>

          {/* Historial */}
          {job.history?.length > 1 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Historial</h3>
              <div className="space-y-0.5 text-[11px] text-slate-500">
                {[...job.history].reverse().map((h, i) => (
                  <p key={i}>{new Date(h.at).toLocaleString()} → {STATUSES.find((s) => s.id === h.status)?.label || h.status}</p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
