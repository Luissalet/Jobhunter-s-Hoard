import { useState } from "react";
import { api, statusLabel } from "../api.js";
import { agendaGroups, localDateValue } from "../job-insights.js";
import Icon from "./Icon.jsx";

export default function AgendaTab({ jobs, replaceJob, openDetail, notify }) {
  const [view, setView] = useState("due"), [busy, setBusy] = useState({});
  const groups = agendaGroups(jobs);
  const tabs = [["due", "Hoy y atrasadas"], ["interviews", "Entrevistas"], ["future", "Programadas"], ["unplanned", "Sin próxima acción"]];
  const patch = async (job, body) => {
    setBusy((b) => ({ ...b, [job.id]: true }));
    try { replaceJob(await api.patchJob(job.id, body)); notify("Seguimiento actualizado.", "info"); }
    catch (e) { notify(e.message); }
    finally { setBusy((b) => ({ ...b, [job.id]: false })); }
  };
  const draft = async (job) => {
    setBusy((b) => ({ ...b, [job.id]: true }));
    try { replaceJob(await api.followup(job.id, job.lang)); openDetail(job.id); notify("Borrador listo en Actividad.", "info"); }
    catch (e) { notify(e.message); }
    finally { setBusy((b) => ({ ...b, [job.id]: false })); }
  };
  const postpone = (job, days) => {
    const date = new Date(); date.setDate(date.getDate() + days);
    patch(job, { nextActionAt: localDateValue(date) + "T09:00:00" });
  };
  return <div className="agenda-workspace">
    {groups.unplanned.length > 0 && <div className="context-notice"><Icon name="calendar" /><div><strong>{groups.unplanned.length} candidaturas abiertas sin próxima acción</strong><p>Una candidatura importada puede no tener fecha de envío. Planifica cuándo revisarla para que aparezca en tu agenda.</p></div><button className="btn-ghost" onClick={() => setView("unplanned")}>Planificar</button></div>}
    <div className="filter-tabs agenda-tabs" aria-label="Vistas de seguimiento">{tabs.map(([id, label]) => <button key={id} className={view === id ? "selected" : ""} aria-pressed={view === id} onClick={() => setView(id)}>{label}<span>{groups[id].length}</span></button>)}</div>
    <p className="supporting-copy">{view === "interviews" ? "Entrevistas de hoy y de los próximos 14 días." : view === "unplanned" ? "Elige una fecha para volver a revisar cada candidatura." : "El recordatorio organiza tu trabajo; redactar un mensaje no lo envía."}</p>
    {groups[view].length ? <div className="agenda-list">{groups[view].map((job) => <article className="agenda-row" key={job.id}>
      <button className="agenda-identity job-open" onClick={() => openDetail(job.id)}><strong>{job.title}</strong><span>{job.company || "Empresa por confirmar"} · {statusLabel(job.status)}</span></button>
      <div className="agenda-date">
        {view === "interviews" ? <time>{new Date(job.interviewAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time> : <label><span>Próxima revisión</span><input type="date" aria-label={"Próxima revisión de " + (job.company || job.title)} disabled={busy[job.id]} value={localDateValue(job.nextActionAt)} onChange={(e) => patch(job, { nextActionAt: e.target.value ? e.target.value + "T09:00:00" : null })} /></label>}
      </div>
      <div className="agenda-actions">
        {view === "due" && <><button className="btn-ghost" disabled={busy[job.id]} onClick={() => draft(job)}>Redactar mensaje</button><button className="btn-ghost" disabled={busy[job.id]} onClick={() => postpone(job, 5)}>Posponer 5 días</button><button className="text-action" disabled={busy[job.id]} onClick={() => patch(job, { nextActionAt: null })}>Hecho</button></>}
        {view === "unplanned" && <button className="btn-ghost" disabled={busy[job.id]} onClick={() => postpone(job, 1)}>Revisar mañana</button>}
        {view === "interviews" && <button className="btn-ghost" onClick={() => openDetail(job.id)}>Preparar entrevista</button>}
      </div>
    </article>)}</div> : <div className="section-empty"><Icon name="calendar" width="28" height="28" /><h2>{view === "due" ? "Hoy no tienes revisiones programadas" : view === "interviews" ? "Sin entrevistas próximas" : view === "future" ? "Tu agenda está por organizar" : "Todas tienen un próximo paso"}</h2><p>{view === "interviews" ? "Añade la fecha de una entrevista desde Actividad, dentro de la candidatura." : "Puedes programar una revisión en Sin próxima acción o desde el detalle de una candidatura."}</p>{groups.unplanned.length > 0 && view !== "unplanned" && <button className="btn-ghost" onClick={() => setView("unplanned")}>Organizar candidaturas abiertas</button>}</div>}
  </div>;
}
