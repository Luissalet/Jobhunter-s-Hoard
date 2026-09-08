import { useMemo } from "react";
import { STATUSES } from "../api.js";
import { jobInsights, wasSubmitted, hasResponse, validDate, localDateValue } from "../job-insights.js";
import { modeLabel } from "./ApplicationsTab.jsx";
import Icon from "./Icon.jsx";

function weekStart(value) {
  const date = new Date(value); date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDateValue(date);
}
export default function StatsTab({ jobs, settings }) {
  const stats = useMemo(() => jobInsights(jobs), [jobs]);
  const weeks = useMemo(() => {
    const result = new Map();
    for (let i = 7; i >= 0; i--) { const date = new Date(); date.setDate(date.getDate() - i * 7); result.set(weekStart(date), 0); }
    for (const job of jobs) if (validDate(job.appliedAt)) { const key = weekStart(job.appliedAt); if (result.has(key)) result.set(key, result.get(key) + 1); }
    return [...result];
  }, [jobs]);
  const sources = [...new Set(jobs.map((j) => j.source || "Sin fuente"))].map((source) => {
    const group = jobs.filter((j) => (j.source || "Sin fuente") === source);
    return { source, total: group.length, sent: group.filter(wasSubmitted).length, replies: group.filter((j) => wasSubmitted(j) && hasResponse(j)).length };
  }).sort((a, b) => b.total - a.total);
  const dated = stats.submitted.length - stats.missingDates.length;
  const maxWeek = Math.max(...weeks.map(([, n]) => n), 1);
  return <div className="insights-workspace">
    <div className="results-overview">
      <div><span>Candidaturas enviadas</span><strong>{stats.submitted.length}</strong><small>Incluye procesos cerrados</small></div>
      <div><span>Con respuesta</span><strong>{stats.responses.length}</strong><small>Incluye rechazos</small></div>
      <div><span>Llegaron a entrevista</span><strong>{stats.interviews.length}</strong><small>Según estado e historial</small></div>
      <div><span>Ofertas recibidas</span><strong>{stats.offers.length}</strong><small>Según estado e historial</small></div>
    </div>
    {stats.missingDates.length > 0 && <div className="context-notice"><Icon name="calendar" /><div><strong>{stats.missingDates.length} envíos sin fecha registrada</strong><p>Se cuentan en los resultados, pero no en la actividad semanal. Puedes completar la fecha de envío en el detalle de cada candidatura.</p></div></div>}
    <div className="insights-columns">
      <section className="insight-section"><h2>Estado actual</h2><p>Distribución de tus {jobs.length} candidaturas.</p><div className="distribution-list">{STATUSES.map((status) => {
        const count = jobs.filter((j) => j.status === status.id).length;
        return <div className="distribution-row" key={status.id}><span>{status.label}</span><meter min="0" max={Math.max(jobs.length, 1)} value={count} aria-label={status.label} /><strong>{count}</strong></div>;
      })}</div></section>
      <section className="insight-section"><h2>Modalidad de trabajo</h2><p>Cómo se reparte tu búsqueda.</p><div className="distribution-list">{["remote", "hybrid", "onsite", "unknown"].map((mode) => {
        const count = jobs.filter((j) => (j.workMode || "unknown") === mode).length;
        return <div className="distribution-row" key={mode}><span>{modeLabel(mode)}</span><meter min="0" max={Math.max(jobs.length, 1)} value={count} aria-label={modeLabel(mode)} /><strong>{count}</strong></div>;
      })}</div><p className="insight-note">{stats.submitted.length ? Math.round(stats.responses.length / stats.submitted.length * 100) + "% de los envíos tienen una respuesta registrada." : "Aún no hay envíos registrados."}</p></section>
      <section className="insight-section"><h2>Actividad semanal</h2><p>Últimas ocho semanas · objetivo: {settings.weeklyGoal || "sin definir"} envíos por semana.</p>{dated ? <div className="distribution-list">{weeks.map(([week, count]) => <div className="distribution-row" key={week}><span>{new Date(week + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span><meter min="0" max={maxWeek} value={count} aria-label={"Envíos en la semana del " + week} /><strong>{count}</strong></div>)}</div> : <div className="section-empty compact"><Icon name="calendar" /><h3>Faltan las fechas para mostrar tu actividad</h3><p>Los registros importados se conservan sin asignarles una fecha de envío inventada.</p></div>}</section>
      <section className="insight-section"><h2>Por fuente</h2><p>Envios y respuestas registrados en cada origen.</p><div className="insight-table-wrap"><table className="insight-table"><thead><tr><th>Fuente</th><th>Ofertas</th><th>Enviadas</th><th>Respuestas</th></tr></thead><tbody>{sources.map((s) => <tr key={s.source}><th scope="row">{s.source}</th><td>{s.total}</td><td>{s.sent}</td><td>{s.replies}</td></tr>)}</tbody></table>{!sources.length && <p>Aún no hay candidaturas para comparar.</p>}</div></section>
    </div>
  </div>;
}
