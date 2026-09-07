import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import { confirmDiscard, useUnsavedChanges } from "../useUnsavedChanges.js";
export default function AddJob({ contextId, close, onCreated, notify }) {
  const dialog = useRef(null),
    [job, setJob] = useState({
      title: "",
      company: "",
      url: "",
      description: "",
      workMode: "unknown",
      contextId,
      source: "manual",
    }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
    dialog.current.querySelector("input")?.focus();
  }, []);
  const pending = !!(job.title || job.company || job.url || job.description);
  useUnsavedChanges(pending);
  const requestClose = () => {
    if (confirmDiscard(pending)) close();
  };
  const set = (k, v) => setJob((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const j = await api.addJob({ ...job, applyUrl: job.url });
      onCreated(j);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="job-dialog"
      aria-labelledby="add-job-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="section-heading">
          <h2 id="add-job-title">Añadir una oferta</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar"
            onClick={requestClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          Guarda la oferta. Tu asistente podrá leerla y preparar la candidatura
          desde aquí.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Puesto</span>
            <input
              required
              autoFocus
              value={job.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Empresa</span>
            <input
              value={job.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>Enlace a la oferta</span>
          <input
            type="url"
            placeholder="https://www.linkedin.com/jobs/view/…"
            value={job.url}
            onChange={(e) => set("url", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Modalidad</span>
          <select
            value={job.workMode}
            onChange={(e) => set("workMode", e.target.value)}
          >
            <option value="unknown">Por confirmar</option>
            <option value="remote">Remoto</option>
            <option value="hybrid">Híbrido</option>
            <option value="onsite">Presencial</option>
          </select>
        </label>
        <label className="field">
          <span>Descripción de la oferta</span>
          <textarea
            rows="7"
            value={job.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Responsabilidades, requisitos y condiciones…"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={requestClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar oferta"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
