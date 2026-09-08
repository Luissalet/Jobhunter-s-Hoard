import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import SearchTab from "./components/SearchTab.jsx";
import AgendaTab from "./components/AgendaTab.jsx";
import StatsTab from "./components/StatsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import WorkspaceTab from "./components/WorkspaceTab.jsx";
import ApplicationsTab from "./components/ApplicationsTab.jsx";
import ConnectionTab from "./components/ConnectionTab.jsx";
import ApplicationDetail from "./components/ApplicationDetail.jsx";
import AddJob from "./components/AddJob.jsx";
import Icon from "./components/Icon.jsx";
import { confirmDiscard } from "./useUnsavedChanges.js";
const NAV = [
  ["pipeline", "Candidaturas", "briefcase"],
  ["agenda", "Seguimiento", "calendar"],
  ["search", "Buscar ofertas", "search"],
  ["context", "Mi contexto", "folder"],
  ["connection", "Conectar IA", "connect"],
  ["stats", "Resultados", "chart"],
  ["settings", "Ajustes", "settings"],
];
export default function App() {
  const [state, setState] = useState(null),
    [tab, setTab] = useState("pipeline"),
    [detailId, setDetailId] = useState(null),
    [adding, setAdding] = useState(false),
    [toast, setToast] = useState(null),
    [error, setError] = useState("");
  const notify = useCallback(
    (msg, type = "error") => setToast({ msg, type }),
    [],
  );
  const [pending, setPending] = useState(false);
  const navigate = (id) => {
    if (id === tab) return;
    if (confirmDiscard(pending)) {
      setPending(false);
      setTab(id);
    }
  };
  const refresh = useCallback(async () => {
    const s = await api.state();
    setState(s);
    return s;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const t = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const replaceJob = (j) =>
    setState((s) => ({
      ...s,
      jobs: s.jobs.map((x) => (x.id === j.id ? j : x)),
    }));
  if (!state)
    return (
      <div className="startup">
        <span className="brand-mark">j.</span>
        <h1>Jubhunter's Hoard</h1>
        <p>{error || "Abriendo tu espacio de trabajo…"}</p>
        {error && (
          <button
            className="btn-primary"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Reintentar
          </button>
        )}
      </div>
    );
  const context =
      state.contexts.find((c) => c.id === state.activeContextId) ||
      state.contexts[0],
    jobs = state.jobs.filter((j) => j.contextId === context.id),
    page = NAV.find((x) => x[0] === tab);
  const changeContext = async (id, alreadySaved = false) => {
    if (!alreadySaved && !confirmDiscard(pending)) return;
    try {
      await api.workspace(`/api/contexts/${id}/activate`, "POST", {});
      await refresh();
      setPending(false);
      setDetailId(null);
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("pipeline");
          }}
        >
          <span className="brand-mark">j.</span>
          <span>
            jubhunter's<span className="brand-sub">HOARD</span>
          </span>
        </a>
        <div className="space-label">Tu espacio de trabajo</div>
        <nav aria-label="Navegación principal">
          {NAV.map(([id, label, icon], i) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={`nav-item ${tab === id ? "active" : ""} ${i === 5 ? "nav-secondary" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === "pipeline" && jobs.length > 0 && (
                <span className="nav-count">{jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Guardado en este equipo
          <small>Tu trayectoria. Tu siguiente paso.</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Mi espacio <span>/</span> <strong>{page[1]}</strong>
          </div>
          <label className="context-picker">
            <Icon name="folder" />
            <select
              aria-label="Contexto activo"
              value={context.id}
              onChange={(e) => changeContext(e.target.value)}
            >
              {state.contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="avatar" title={state.settings.personal.name}>
            {state.settings.personal.name
              ?.split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("") || "Yo"}
          </span>
        </header>
        <main className="main-content" id="main-content">
          {tab === "pipeline" && (
            <ApplicationsTab
              key={context.id}
              jobs={jobs}
              context={context}
              add={() => setAdding(true)}
              openDetail={setDetailId}
              navigate={navigate}
              refresh={refresh}
              notify={notify}
            />
          )}
          {tab === "context" && (
            <WorkspaceTab
              key={context.id}
              context={context}
              state={state}
              refresh={refresh}
              notify={notify}
              changeContext={changeContext}
              onDirty={setPending}
            />
          )}
          {tab === "connection" && <ConnectionTab notify={notify} />}
          {["agenda", "search", "stats", "settings"].includes(tab) && (
            <div className="legacy-page">
              <div className="page-heading">
                <div>
                  <h1>{page[1]}</h1>
                  <p>
                    {tab === "search"
                      ? "Encuentra ofertas y lleva las que encajan a tus candidaturas."
                      : tab === "agenda"
                        ? "Respuestas, entrevistas y próximos pasos."
                        : tab === "stats"
                          ? "Observa cómo avanza tu búsqueda."
                          : "Servicios opcionales, objetivo y copia de seguridad."}
                  </p>
                </div>
              </div>
              <div className="legacy-content">
                {tab === "agenda" && (
                  <AgendaTab
                    key={context.id}
                    jobs={jobs}
                    replaceJob={replaceJob}
                    openDetail={setDetailId}
                    notify={notify}
                  />
                )}
                {tab === "search" && (
                  <SearchTab
                    settings={state.settings}
                    sources={state.sources}
                    addJobs={refresh}
                    notify={notify}
                    saveSearches={(savedSearches) =>
                      api.saveSettings({ savedSearches }).then(refresh)
                    }
                  />
                )}
                {tab === "stats" && (
                  <StatsTab jobs={jobs} settings={state.settings} />
                )}
                {tab === "settings" && (
                  <SettingsTab
                    state={state}
                    setState={setState}
                    notify={notify}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {adding && (
        <AddJob
          contextId={context.id}
          close={() => setAdding(false)}
          notify={notify}
          onCreated={(j) => {
            refresh();
            setAdding(false);
            setDetailId(j.id);
          }}
        />
      )}
      {detailId && state.jobs.find((j) => j.id === detailId) && (
        <ApplicationDetail
          key={detailId}
          job={state.jobs.find((j) => j.id === detailId)}
          close={() => setDetailId(null)}
          notify={notify}
          refresh={refresh}
        />
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.msg}
          <button aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
