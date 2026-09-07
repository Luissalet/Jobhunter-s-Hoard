import { useState } from "react";
import { api, statusLabel } from "../api.js";
import Icon from "./Icon.jsx";
export const modeLabel = (m) =>
  ({
    remote: "Remoto",
    hybrid: "Híbrido",
    onsite: "Presencial",
    unknown: "Por confirmar",
  })[m] || "Por confirmar";
const filters = [
  ["all", "Todas"],
  ["inbox", "Por explorar"],
  ["prepared", "Preparadas"],
  ["sent", "Enviadas"],
  ["attention", "Necesitan atención"],
  ["closed", "Cerradas"],
];
export default function ApplicationsTab({
  jobs,
  context,
  add,
  openDetail,
  navigate,
  refresh,
  notify,
}) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [importing, setImporting] = useState(false),
    [raw, setRaw] = useState(""),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false);
  const match = (j, f) =>
    f === "all" ||
    (f === "inbox" && ["inbox", "interested"].includes(j.status)) ||
    (f === "prepared" && j.status === "tailored") ||
    (f === "sent" &&
      ["applied", "answered", "interview", "offer"].includes(j.status)) ||
    (f === "attention" &&
      ["unknown", "blocked"].includes(j.application?.state)) ||
    (f === "closed" && ["discarded", "rejected"].includes(j.status));
  const visible = jobs.filter(
    (j) =>
      match(j, filter) &&
      `${j.title} ${j.company}`.toLowerCase().includes(query.toLowerCase()),
  );
  const importAction = async (commit) => {
    setBusy(true);
    try {
      const out = await api.workspace(
        `/api/sheet/${commit ? "import" : "preview"}`,
        "POST",
        { text: raw, contextId: context.id },
      );
      if (commit) {
        await refresh();
        setImporting(false);
        setRaw("");
        setPreview(null);
        notify(
          `${out.added} candidaturas importadas. ${out.skipped} duplicadas omitidas.`,
          "info",
        );
      } else setPreview(out);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <h1>Candidaturas</h1>
          <p>Todo lo que exploras, preparas y envías, en un solo lugar.</p>
        </div>
        <div className="heading-actions">
          <button
            className="btn-ghost"
            onClick={() => setImporting(!importing)}
          >
            <Icon name="upload" />
            Importar hoja
          </button>
          <button className="btn-primary" onClick={add}>
            <Icon name="plus" />
            Añadir oferta
          </button>
        </div>
      </div>
      {importing && (
        <section className="inline-panel">
          <div className="section-heading">
            <h2>Trae tu registro de candidaturas</h2>
            <button
              className="icon-button"
              aria-label="Cerrar importación"
              onClick={() => setImporting(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <p>
            Copia las celdas de Google Sheets con sus cabeceras, o carga un CSV.
            Reconocemos LINK, EMPRESA, PUESTO, TIPO y ESTADO.
          </p>
          <label className="field">
            <span>Contenido de la hoja</span>
            <textarea
              rows="5"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setPreview(null);
              }}
              placeholder="LINK&#9;EMPRESA&#9;PUESTO&#9;TIPO&#9;ESTADO"
            />
          </label>
          <label className="file-input">
            Cargar CSV o TSV
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={async (e) => {
                try {
                  if (e.target.files[0]) {
                    setRaw(await e.target.files[0].text());
                    setPreview(null);
                  }
                } catch (err) {
                  notify(err.message);
                }
              }}
            />
          </label>
          {preview && (
            <div className="import-preview">
              <p>
                <strong>{preview.filter((r) => !r.duplicate).length}</strong>{" "}
                nuevas · {preview.filter((r) => r.duplicate).length} duplicadas
              </p>
              {preview.slice(0, 6).map((r) => (
                <div key={r.row}>
                  <span>
                    {r.item.company} · {r.item.title}
                  </span>
                  <span>
                    {r.duplicate ? "Ya registrada" : statusLabel(r.item.status)}
                  </span>
                  {r.warnings.length > 0 && (
                    <small>{r.warnings.join(" · ")}</small>
                  )}
                </div>
              ))}
              {preview.length > 6 && (
                <small>Y {preview.length - 6} filas más.</small>
              )}
            </div>
          )}
          <div className="form-actions">
            <button
              className="btn-ghost"
              disabled={busy || !raw.trim()}
              onClick={() => importAction(false)}
            >
              Comprobar filas
            </button>
            {preview && (
              <button
                className="btn-primary"
                disabled={busy || !preview.some((r) => !r.duplicate)}
                onClick={() => importAction(true)}
              >
                {busy ? "Importando…" : "Importar candidaturas"}
              </button>
            )}
          </div>
        </section>
      )}
      <div className="list-summary">
        <span>{jobs.length} candidaturas</span>
        <span>{jobs.filter((j) => match(j, "sent")).length} enviadas</span>
        <span className="summary-context">{context.name}</span>
      </div>
      <div className="table-toolbar">
        <div className="filter-tabs" aria-label="Filtrar candidaturas">
          {filters.map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "selected" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{jobs.filter((j) => match(j, id)).length}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Buscar candidaturas"
            placeholder="Buscar puesto o empresa"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {!jobs.length && !importing ? (
        <div className="empty-workspace">
          <div className="empty-intro">
            <div className="dossier-symbol">
              <Icon name="briefcase" width="31" height="31" />
            </div>
            <h2>
              Tu próximo paso,
              <br />
              con todo a mano.
            </h2>
            <p>
              Una buena candidatura empieza por conocerte. Reúne tu trayectoria
              una vez y deja que tu asistente la use en cada solicitud.
            </p>
            <button className="text-action" onClick={() => navigate("context")}>
              Preparar mi contexto <Icon name="arrow" />
            </button>
          </div>
          <div className="setup-list">
            <button onClick={() => navigate("context")}>
              <span className="setup-number">1</span>
              <div>
                <strong>Cuéntale quién eres</strong>
                <p>CVs, proyectos, experiencia y lo que buscas.</p>
              </div>
              <Icon name="arrow" />
            </button>
            <button onClick={() => navigate("connection")}>
              <span className="setup-number">2</span>
              <div>
                <strong>Conecta tu asistente</strong>
                <p>La IA consulta tu contexto y registra sus avances.</p>
              </div>
              <Icon name="arrow" />
            </button>
            <button onClick={add}>
              <span className="setup-number">3</span>
              <div>
                <strong>Empieza por una oferta</strong>
                <p>Prepara, revisa y sigue cada candidatura.</p>
              </div>
              <Icon name="arrow" />
            </button>
          </div>
        </div>
      ) : visible.length ? (
        <div className="jobs-table">
          <div className="jobs-table-head">
            <span>Puesto y empresa</span>
            <span>Modalidad</span>
            <span>Estado</span>
            <span>Actualizada</span>
            <span />
          </div>
          {visible.map((j) => (
            <button
              className="job-row"
              key={j.id}
              onClick={() => openDetail(j.id)}
            >
              <div className="job-identity">
                <span className="company-monogram">
                  {(j.company || j.title).slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{j.title}</strong>
                  <small>
                    {j.company || "Empresa por confirmar"}
                    {j.location ? ` · ${j.location}` : ""}
                  </small>
                </span>
              </div>
              <span className="job-mode">{modeLabel(j.workMode)}</span>
              <span>
                <span className={`status-badge ${j.status}`}>
                  {["unknown", "blocked", "in_progress"].includes(
                    j.application?.state,
                  )
                    ? {
                        unknown: "Comprobar envío",
                        blocked: "Bloqueada",
                        in_progress: "En curso",
                      }[j.application.state]
                    : statusLabel(j.status)}
                </span>
              </span>
              <time>
                {new Date(j.updatedAt).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                })}
              </time>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-filter">
          <h2>No hay candidaturas en esta vista</h2>
          <p>Prueba otro estado o cambia los términos de búsqueda.</p>
          <button
            className="btn-ghost"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            Ver todas
          </button>
        </div>
      )}
      <div className="table-footer">
        <span>El registro se actualiza cuando trabaja tu asistente.</span>
        <a href="/api/export.csv">
          Exportar CSV <Icon name="external" width="14" height="14" />
        </a>
      </div>
    </div>
  );
}
