import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";

export default function SourceReader({ contextId, contextName, source, onClose }) {
  const request = useRef(0);
  const [file, setFile] = useState(source.kind === "folder" ? null : "");
  const [listing, setListing] = useState(null), [page, setPage] = useState(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(null);
  const base = `/api/contexts/${encodeURIComponent(contextId)}/sources/${encodeURIComponent(source.id)}`;

  async function load(target) {
    const ticket = ++request.current;
    setBusy(true); setFailure(null);
    try {
      const data = await api.workspace(target.kind === "files" ? `${base}/files`
        : `${base}/read?${new URLSearchParams({ file: target.file, offset: String(target.offset) })}`);
      if (ticket !== request.current) return;
      if (target.kind === "files") setListing(data);
      else setPage({ ...data, fileSelected: target.file, history: target.history });
    } catch (error) {
      if (ticket === request.current) setFailure({ message: error.message, target });
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(source.kind === "folder" ? { kind: "files" } : { kind: "read", file: "", offset: 0, history: [] });
    return () => { request.current++; };
  }, [contextId, source.id]);

  function choose(nextFile) {
    setFile(nextFile); setPage(null);
    void load({ kind: "read", file: nextFile, offset: 0, history: [] });
  }
  function backToFiles() {
    request.current++; setFile(null); setPage(null); setFailure(null); setBusy(false);
  }
  return <section className="source-preview" aria-label="Lectura de fuente">
    <div className="section-heading">
      <h3>{source.label}</h3>
      <button className="icon-button" aria-label="Cerrar vista previa" onClick={onClose}><Icon name="close" /></button>
    </div>
    <p className="supporting-copy" style={{ overflowWrap: "anywhere" }}>{contextName}{file ? ` · ${file}` : ""}</p>
    {source.kind === "folder" && file !== null && <button type="button" className="text-action" onClick={backToFiles}>Volver a los archivos</button>}
    {busy && <p role="status">{file === null ? "Leyendo lista de archivos…" : "Leyendo fragmento…"}</p>}
    {failure && <div role="alert">
      <p>{failure.message}{page ? " Se conserva el fragmento anterior." : ""}</p>
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => void load(failure.target)}>Reintentar lectura</button>
    </div>}
    {file === null && listing && <>
      <p>{listing.files.length} archivos disponibles{listing.truncated ? " · listado parcial" : ""}</p>
      <ul>{listing.files.map(name => <li key={name}><button type="button" className="text-action" onClick={() => choose(name)}>{name}</button></li>)}</ul>
      {!!listing.errors?.length && <p className="supporting-copy">No se pudieron leer estas carpetas: {listing.errors.join(", ")}</p>}
    </>}
    {page && <>
      <h4>Fragmento de texto</h4>
      <p className="supporting-copy">Desde la posición {page.offset.toLocaleString("es-ES")} de {page.totalChars.toLocaleString("es-ES")}{page.nextOffset === null ? " · Fin del texto extraído" : " · Lectura parcial"}</p>
      <p className="supporting-copy" style={{ overflowWrap: "anywhere" }}>{page.file || page.url || "Texto guardado en la fuente"}</p>
      {page.modifiedAt && <p className="supporting-copy">Modificado: <time dateTime={page.modifiedAt}>{new Date(page.modifiedAt).toLocaleString("es-ES")}</time></p>}
      {page.notice && <p className="supporting-copy">{page.notice}</p>}
      {page.extractedBy && <p className="supporting-copy">Extracción: {page.extractedBy}</p>}
      {!!page.extractionNotes?.length && <ul>{page.extractionNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      <pre>{page.content || "Este fragmento no contiene texto."}</pre>
      <div className="form-actions">
        <button type="button" className="btn-ghost" disabled={busy || !page.history.length} onClick={() => void load({ kind: "read", file: page.fileSelected, offset: page.history.at(-1), history: page.history.slice(0, -1) })}>Anterior</button>
        <button type="button" className="btn-primary" disabled={busy || page.nextOffset === null} onClick={() => void load({ kind: "read", file: page.fileSelected, offset: page.nextOffset, history: [...page.history, page.offset] })}>Siguiente fragmento</button>
      </div>
      <p className="supporting-copy">Posiciones del texto extraído en unidades UTF-16, no páginas del documento. Cada fragmento lee el contenido actual; el archivo puede cambiar entre lecturas.</p>
    </>}
  </section>;
}
