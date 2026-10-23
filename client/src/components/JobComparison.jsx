import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function JobComparison({ jobs, onClose, onOpen, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const signature = JSON.stringify(jobs.map(job => [job.id, job.updatedAt]));
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    api.workspace('/api/jobs/compare', 'POST', {jobIds:jobs.map(job => job.id)})
      .then(result => { if (live) setData(result); })
      .catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [signature, retry]);
  async function copy() {
    try { await navigator.clipboard.writeText(data.text); notify('Comparativa copiada.', 'info'); }
    catch { notify('No se pudo copiar la comparativa.'); }
  }
  return <section className="job-comparison" aria-labelledby="job-comparison-title">
    <div className="job-comparison-heading"><div><h2 id="job-comparison-title">Comparar ofertas</h2><p>{jobs.length} candidaturas seleccionadas</p></div>
      <div className="heading-actions"><button className="btn-ghost" type="button" disabled={!data} onClick={copy}>Copiar comparativa</button><button className="text-action" type="button" onClick={onClose}>Cerrar comparativa</button></div>
    </div>
    {error ? <p role="alert">{error} <button className="text-action" type="button" onClick={() => setRetry(retry + 1)}>Reintentar</button></p> : !data ? <p role="status">Leyendo los datos guardados…</p> : <>
      <p className="supporting-copy">{data.note}</p>
      <div className="job-comparison-scroll" role="region" aria-label="Tabla comparativa de ofertas" tabIndex={0}>
        <table><caption className="sr-only">Datos guardados de las candidaturas seleccionadas</caption><thead><tr><th scope="col">Dato</th>{data.jobs.map(job => <th scope="col" key={job.id}><button className="job-open" type="button" onClick={() => onOpen(job.id)}>{job.title}</button><small>{job.company || 'Empresa por confirmar'}</small></th>)}</tr></thead>
          <tbody>{data.columns.map(column => <tr key={column.key}><th scope="row">{column.label}</th>{data.jobs.map(job => <td key={job.id}>{job.values[column.key]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
