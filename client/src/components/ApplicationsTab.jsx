import { useEffect, useState } from "react";
import { api, statusLabel, STATUSES } from "../api.js";
import Icon from "./Icon.jsx";
import { wasSubmitted, validDate } from "../job-insights.js";
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
    [statusFilter, setStatusFilter] = useState("all"),
    [modeFilter, setModeFilter] = useState("all"),
    [selected, setSelected] = useState([]),
    [bulkStatus, setBulkStatus] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false),
    [sort, setSort] = useState("recent"),
    [saving, setSaving] = useState({}),
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
      (statusFilter === "all" || j.status === statusFilter) &&
      (modeFilter === "all" || (j.workMode || "unknown") === modeFilter) &&
      `${j.title} ${j.company}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) => {
    const recent = new Date(b.updatedAt) - new Date(a.updatedAt);
    if (sort === "recent") return recent;
    if (sort.startsWith("applied")) {
      if (!validDate(a.appliedAt)) return validDate(b.appliedAt) ? 1 : recent;
      if (!validDate(b.appliedAt)) return -1;
      return (new Date(a.appliedAt) - new Date(b.appliedAt)) * (sort.endsWith("desc") ? -1 : 1) || recent;
    }
    const order = sort.startsWith("mode")
      ? ["remote", "hybrid", "onsite", "unknown"]
      : STATUSES.map((s) => s.id);
    const field = sort.startsWith("mode") ? "workMode" : "status";
    const rank = (job) => order.includes(job[field]) ? order.indexOf(job[field]) : order.length;
    return (rank(a) - rank(b)) * (sort.endsWith("desc") ? -1 : 1) || recent;
  });
  useEffect(() => { setSelected([]); }, [filter, statusFilter, modeFilter, query, context.id]);
  const selectedJobs = visible.filter((j) => selected.includes(j.id));
  const applyBulk = async () => {
    if (!bulkStatus || !selectedJobs.length || bulkBusy) return;
    setBulkBusy(true);
    let changed = 0;
    const failed = [];
    for (const job of selectedJobs) {
      try { await api.patchJob(job.id, { status: bulkStatus }); changed++; }
      catch { failed.push(job.id); }
    }
    try { await refresh(); }
    catch { notify("Cambios enviados. No se pudo recargar la lista; vuelve a cargar la página."); }
    setSelected(failed);
    setBulkBusy(false);
    notify(failed.length ? `${changed} actualizadas; ${failed.length} no se pudieron guardar. Puedes reintentarlo.` : `${changed} candidaturas actualizadas.`, failed.length ? "error" : "info");
  };
  const changeStatus = async (job, status) => {
    if (saving[job.id] || status === job.status) return;
    setSaving((current) => ({ ...current, [job.id]: true }));
    try {
      await api.patchJob(job.id, { status });
      await refresh();
      notify(`${job.company || job.title}: ${statusLabel(status)}`, "info");
    } catch (error) {
      notify(`No se pudo actualizar el estado. ${error.message}`);
    } finally {
      setSaving((current) => ({ ...current, [job.id]: false }));
    }
  };
  const toggleSort = (field) => setSort(sort === `${field}-asc` ? `${field}-desc` : `${field}-asc`);
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
        <span>{jobs.filter(wasSubmitted).length} envíos registrados</span>
        <span className="summary-context">{context.name}</span>
      </div>
      <div className="table-toolbar">
        <div className="filter-tabs" aria-label="Filtrar candidaturas">
          {filters.map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "selected" : ""}
              aria-pressed={filter === id}
              onClick={() => { setFilter(id); setStatusFilter("all"); }}
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
      <div className="list-controls">
        <label className="list-control">
          <span>Estado</span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setFilter("all"); }}>
            <option value="all">Todos los estados</option>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label} ({jobs.filter((j) => j.status === s.id).length})</option>)}
          </select>
        </label>
        <label className="list-control">
          <span>Modalidad</span>
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
            <option value="all">Todas las modalidades</option>
            {["remote", "hybrid", "onsite", "unknown"].map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
          </select>
        </label>
        <label className="list-control">
          <span>Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Última actualización</option>
            <option value="applied-desc">Fecha de envío: recientes primero</option>
            <option value="applied-asc">Fecha de envío: antiguas primero</option>
            <option value="mode-asc">Modalidad: remoto primero</option>
            <option value="mode-desc">Modalidad: orden inverso</option>
            <option value="status-asc">Estado: iniciales primero</option>
            <option value="status-desc">Estado: finales primero</option>
          </select>
        </label>
        <span className="list-result-count" role="status">{visible.length} de {jobs.length} candidaturas</span>
      </div>
      {visible.length > 0 && <div className="selection-toolbar">
        <label className="selection-toggle"><input type="checkbox" checked={selectedJobs.length === visible.length} disabled={bulkBusy} onChange={(e) => setSelected(e.target.checked ? visible.map((j) => j.id) : [])} />Seleccionar visibles</label>
        {selectedJobs.length > 0 && <>
          <strong>{selectedJobs.length} seleccionadas</strong>
          <select aria-label="Estado para las seleccionadas" value={bulkStatus} disabled={bulkBusy} onChange={(e) => setBulkStatus(e.target.value)}>
            <option value="">Cambiar estado a…</option>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn-primary" disabled={bulkBusy || !bulkStatus} onClick={applyBulk}>{bulkBusy ? "Guardando…" : "Aplicar a seleccionadas"}</button>
          <button className="text-action" disabled={bulkBusy} onClick={() => setSelected([])}>Cancelar selección</button>
        </>}
      </div>}
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
        <div className="jobs-table selectable-jobs">
          <div className="jobs-table-head">
            <span />
            <span>Puesto y empresa</span>
            <button onClick={() => toggleSort("mode")} aria-label={`Ordenar por modalidad${sort.startsWith("mode") ? ", invertir orden" : ""}`}>Modalidad {sort.startsWith("mode") && (sort.endsWith("asc") ? "↑" : "↓")}</button>
            <button onClick={() => toggleSort("status")} aria-label={`Ordenar por estado${sort.startsWith("status") ? ", invertir orden" : ""}`}>Estado {sort.startsWith("status") && (sort.endsWith("asc") ? "↑" : "↓")}</button>
            <button onClick={() => setSort(sort === "applied-desc" ? "applied-asc" : "applied-desc")}>Fecha de envío {sort.startsWith("applied") && (sort.endsWith("asc") ? "↑" : "↓")}</button>
            <span />
          </div>
          {visible.map((j) => (
            <div
              className="job-row"
              key={j.id}
            >
              <input type="checkbox" className="job-checkbox" aria-label={`Seleccionar ${j.title} en ${j.company || "empresa por confirmar"}`} disabled={bulkBusy || saving[j.id]} checked={selected.includes(j.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, j.id] : ids.filter((id) => id !== j.id))} />
              <button className="job-identity job-open" onClick={() => openDetail(j.id)}>
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
              </button>
              <span className="job-mode">{modeLabel(j.workMode)}</span>
              <div className="job-status-control">
                <select className={`status-badge status-select ${j.status}`} aria-label={`Estado de ${j.title} en ${j.company || "empresa por confirmar"}`} value={j.status} disabled={bulkBusy || saving[j.id]} onChange={(e) => changeStatus(j, e.target.value)}>
                  {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {saving[j.id] && <small role="status">Guardando…</small>}
                {["unknown", "blocked", "in_progress"].includes(j.application?.state) && <small>
                  {["unknown", "blocked", "in_progress"].includes(
                    j.application?.state,
                  )
                    ? {
                        unknown: "Comprobar envío",
                        blocked: "Bloqueada",
                        in_progress: "En curso",
                      }[j.application.state]
                    : statusLabel(j.status)}
                </small>}
              </div>
              <time className="job-applied-date" dateTime={validDate(j.appliedAt) ? j.appliedAt : undefined}>
                <span className="mobile-date-label">Envío: </span>{validDate(j.appliedAt) ? new Date(j.appliedAt).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }) : "Sin fecha"}
              </time>
              <button className="job-detail-link" aria-label={`Abrir ${j.title} en ${j.company || "empresa por confirmar"}`} onClick={() => openDetail(j.id)}><Icon name="arrow" /></button>
            </div>
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
              setStatusFilter("all");
              setModeFilter("all");
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
