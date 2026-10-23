import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useCopilotContext } from '../copilot-hooks.js';
import Icon from './Icon.jsx';

const types = { utc: 'Instante UTC', floating: 'Hora flotante · zona de la agenda de destino', date: 'Día completo' };
const reasons = { not_found: 'La candidatura ya no existe', missing_date: 'Sin fecha guardada', invalid_date: 'Fecha guardada no válida' };

export default function AgendaCalendar({ jobs, view, label }) {
  const [state, setState] = useState(null);
  const sequence = useRef(0);
  const signature = JSON.stringify([view, jobs.map(job => [job.id, job.updatedAt, job.nextActionAt, job.interviewAt])]);
  const current = useRef(signature);
  current.current = signature;
  useEffect(() => { setState(null); sequence.current++; }, [signature]);
  useEffect(() => () => { sequence.current++; }, []);
  const visible = state?.signature === signature ? state : null;
  const snapshot = visible?.data;
  const kind = view === 'interviews' ? 'interview' : 'review';
  useCopilotContext(() => visible ? { editors: [{ kind: 'calendar-export', dirty: false, fields: {
    view, jobIds: jobs.map(job => job.id), kind, pending: visible.loading,
    snapshot: snapshot ? { generatedAt: snapshot.generatedAt, events: snapshot.events, skipped: snapshot.skipped } : null,
  } }] } : null);
  const prepare = async () => {
    const id = ++sequence.current;
    const scope = signature;
    setState({ signature: scope, loading: true });
    try {
      const data = await api.workspace('/api/jobs/calendar', 'POST', { jobIds: jobs.map(job => job.id), kind });
      if (current.current === scope && sequence.current === id) setState({ signature: scope, data, loading: false });
    } catch (error) {
      if (current.current === scope && sequence.current === id) setState({ signature: scope, error: error.message, loading: false });
    }
  };
  const close = () => { sequence.current++; setState(null); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([snapshot.ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `jobhunter-${kind}.ics`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (view === 'unplanned') return null;
  return <section className="agenda-calendar" aria-label="Exportar fechas al calendario">
    <div className="agenda-calendar-heading">
      <div><strong>Fechas de {label.toLocaleLowerCase('es-ES')}</strong><p className="supporting-copy">{jobs.length} {jobs.length === 1 ? 'candidatura visible' : 'candidaturas visibles'}. Sólo se exporta {kind === 'interview' ? 'la fecha de entrevista' : 'la próxima revisión'} guardada.</p></div>
      <button type="button" className="btn-ghost" disabled={!jobs.length || visible?.loading} onClick={prepare}><Icon name="calendar" />{visible?.loading ? 'Preparando…' : 'Llevar estas fechas al calendario'}</button>
    </div>
    {visible && <div className="agenda-calendar-preview">
      <div className="agenda-calendar-heading"><h2>Vista previa del archivo</h2><button type="button" className="text-action" onClick={close}>Cerrar vista previa</button></div>
      {visible.loading && <p role="status">Leyendo las fechas guardadas…</p>}
      {visible.error && <div role="alert"><p>{visible.error}</p><button type="button" className="btn-ghost" onClick={prepare}>Reintentar</button></div>}
      {snapshot && <>
        <p role="status">{snapshot.events.length} {snapshot.events.length === 1 ? 'fecha' : 'fechas'} · {snapshot.skipped.length} {snapshot.skipped.length === 1 ? 'omitida' : 'omitidas'}. Instantánea del {new Date(snapshot.generatedAt).toLocaleString('es-ES')}.</p>
        {snapshot.events.length ? <><ol className="agenda-calendar-events">{snapshot.events.map(event => <li key={event.uid}><strong>{event.title}</strong><time dateTime={event.start}>{event.start.replace('T', ' ')} · {types[event.type]}</time>{event.original !== event.start && <small>Fecha guardada: {event.original}</small>}</li>)}</ol><button type="button" className="btn-primary" onClick={download}>Descargar estas fechas (.ics)</button></> : <p>No hay fechas válidas para exportar en esta selección.</p>}
        {snapshot.skipped.length > 0 && <details open><summary>{snapshot.skipped.length === 1 ? 'Fecha omitida' : 'Fechas omitidas'} ({snapshot.skipped.length})</summary><ul>{snapshot.skipped.map(item => <li key={item.jobId}>{item.title || item.jobId}: {reasons[item.reason]}</li>)}</ul></details>}
        <p className="supporting-copy">Se descarga exactamente esta vista previa, sin sincronización automática. Las horas flotantes no tienen zona guardada: se interpretan en la zona de la agenda donde importes el archivo. No se añaden duración, alarmas ni asistentes.</p>
      </>}
    </div>}
  </section>;
}
