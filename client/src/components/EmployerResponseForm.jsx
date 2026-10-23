import { Field } from './WorkspaceTab.jsx';
import { RESPONSE_KINDS } from '../employer-response.js';

export default function EmployerResponseForm({draft, onChange, onSubmit, busy, error, message, timezone}) {
  const edit = (key, value) => onChange({...draft, [key]: value});
  return <details className="employer-response-form">
    <summary>Registrar respuesta recibida</summary>
    <form onSubmit={onSubmit}>
      <p className="supporting-copy">Anota un mensaje que ya hayas recibido. Guardar no envía una respuesta ni consulta tu correo.</p>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <Field label="Tipo de respuesta"><select value={draft.kind} onChange={event => edit('kind', event.target.value)}>
            {RESPONSE_KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select></Field>
          <Field label="Recibida el" type="datetime-local" required value={draft.receivedAt}
            onChange={event => edit('receivedAt', event.target.value)}/>
        </div>
        <p className="response-timezone">Las fechas y horas de este formulario se interpretan en la zona del ordenador: <strong>{timezone}</strong>.</p>
        <Field label="Texto o evidencia del mensaje"><textarea required maxLength={10000} rows={5} value={draft.evidence}
          placeholder="Copia el fragmento recibido que quieres conservar." onChange={event => edit('evidence', event.target.value)}/></Field>
        {draft.kind === 'interview' && <Field label="Fecha y hora de entrevista (opcional)" hint="Si aún no te han dado fecha, puedes dejarla vacía."
          type="datetime-local" value={draft.interviewAt} onChange={event => edit('interviewAt', event.target.value)}/>}
        <Field label="Notas (opcional)"><textarea maxLength={2000} rows={2} value={draft.notes} onChange={event => edit('notes', event.target.value)}/></Field>
        <Field label="Referencia del mensaje" hint="Identificador del correo o mensaje. La referencia manual propuesta se conserva al reintentar; usa la misma para evitar duplicados."
          required maxLength={300} value={draft.externalId} onChange={event => edit('externalId', event.target.value)}/>
        <p className="supporting-copy">Un acuse de recibo no cambia el estado. La operación nativa registra el resto de respuestas y actualiza el estado cuando corresponde; una entrevista con fecha también aparece en Seguimiento.</p>
        <button className="btn-primary" type="submit">{busy ? 'Guardando respuesta…' : error ? 'Reintentar guardado' : 'Guardar respuesta'}</button>
      </fieldset>
      {error && <p className="response-error" role="alert">No se pudo guardar: {error}. El borrador y la referencia se conservan para reintentar.</p>}
      {message && <p className="response-feedback" role="status">{message}</p>}
    </form>
  </details>;
}
