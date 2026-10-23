import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function SourceSearch({ context }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  function changeQuery(value) {
    request.current++;
    setQuery(value);
    setResult(null);
    setError("");
    setBusy(false);
  }
  async function search(event) {
    event.preventDefault();
    const current = ++request.current, applied = query.trim();
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const data = await api.workspace(`/api/contexts/${encodeURIComponent(context.id)}/search?query=${encodeURIComponent(applied)}`);
      if (current === request.current) setResult({ ...data, query: applied });
    } catch (e) {
      if (current === request.current) setError(e.message);
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  return <section className="source-search" aria-labelledby="source-search-title">
    <h3 id="source-search-title">Buscar en fuentes enlazadas</h3>
    <p className="supporting-copy">Consulta texto de las fuentes activadas de {context.name}. Los enlaces se buscan sólo en su texto pegado; no se descargan páginas.</p>
    <form onSubmit={search} className="source-search-form">
      <label className="field"><span>Texto que quieres encontrar</span><input type="search" value={query} minLength={2} maxLength={200} required onChange={e => changeQuery(e.target.value)} /></label>
      <button className="btn-primary" disabled={busy || query.trim().length < 2}>{busy ? "Buscando…" : "Buscar en fuentes"}</button>
    </form>
    <p className="supporting-copy">Primera coincidencia por documento, sin distinguir mayúsculas. Hasta 60 archivos y sus primeros 20.000 caracteres; puede haber coincidencias fuera de esa cobertura.</p>
    {busy && <p role="status">Buscando en {context.name}…</p>}
    {error && <p role="alert">{error} Puedes reintentar la búsqueda con el mismo texto.</p>}
    {result && <div aria-live="polite">
      <h4>Resultados de «{result.query}» en {context.name}</h4>
      <p>{result.matches.length} documentos con coincidencias · {result.scanned} archivos consultados{result.truncated ? " · Cobertura parcial" : ""}</p>
      <p className="supporting-copy">Para ampliar la consulta, usa Ver en la lista de fuentes. La vista previa también puede ser parcial.</p>
      {!result.matches.length && <p>No hay coincidencias en el texto consultado.</p>}
      <ul className="source-search-results">{result.matches.map((match, index) => <li key={`${match.sourceId}:${match.relativePath}:${index}`}>
        <strong>{match.label}</strong>
        <p className="source-search-meta">{match.relativePath || "Texto de la fuente"}{match.modifiedAt && <> · Modificado: <time dateTime={match.modifiedAt}>{new Date(match.modifiedAt).toLocaleString("es-ES")}</time></>}</p>
        <pre>{match.excerpt}</pre>
      </li>)}</ul>
      {!!result.errors.length && <details className="source-search-errors" open>
        <summary>{result.errors.length === 1 ? "1 fuente o archivo no se pudo consultar" : `${result.errors.length} fuentes o archivos no se pudieron consultar`}</summary>
        <ul>{result.errors.map((item, index) => <li key={index}>{context.sources?.find(source => source.id === item.sourceId)?.label || item.sourceId}{item.file ? ` · ${item.file}` : ""}: {item.error}</li>)}</ul>
      </details>}
    </div>}
  </section>;
}
