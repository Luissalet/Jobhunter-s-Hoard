import { useEffect, useRef, useState } from "react";
import { api, STATUSES, statusLabel } from "../api.js";
import { Field } from "./WorkspaceTab.jsx";
import { modeLabel } from "./ApplicationsTab.jsx";
import Icon from "./Icon.jsx";
import { localDateValue, validDate } from "../job-insights.js";
import { confirmDiscard, useUnsavedChanges } from "../useUnsavedChanges.js";
import { useOpenDialog } from "../useDialog.js";
import { useCopilotContext } from "../copilot-hooks.js";
import { changedFields, rebaseForm, draftToSave, clip, clipFields } from "../copilot-context.js";

// The draft as the form shows it: the saved one, or the tailored texts when nothing was saved yet.
const draftOf = (job) =>
  job.application?.draft || {
    cvMarkdown: job.tailored?.cvMarkdown || "",
    letterMarkdown: job.tailored?.letterMarkdown || "",
    answers: [],
    missing: [],
    lang: job.lang || "es",
  };
const offerForm = (job) => ({ title: job.title, company: job.company || "", location: job.location || "", workMode: job.workMode || "unknown", salary: job.salary || "", url: job.url || "", description: job.description || "", appliedAt: localDateValue(job.appliedAt) });
export default function ApplicationDetail({ job, close, notify, refresh }) {
  const dialog = useRef(null),
    [tab, setTab] = useState("offer"),
    [busy, setBusy] = useState(""),
    [notes, setNotes] = useState(job.notes || ""),
    [offerEdit, setOfferEdit] = useState(null),
    [draft, setDraft] = useState(() => draftOf(job)),
    [dirty, setDirty] = useState(false);
  // What the server had when each form was last in step with it: a reload (the assistant worked meanwhile) moves the fields the
  // user has not touched to the new values and keeps the ones being edited; a save sends only what the user changed.
  const draftBase = useRef(draftOf(job)),
    notesBase = useRef(job.notes || ""),
    offerBase = useRef(null);
  const pending = dirty || notes !== (job.notes || "") || !!offerEdit;
  useUnsavedChanges(pending);
  const requestClose = () => {
    if (confirmDiscard(pending)) close();
  };
  useOpenDialog(dialog, requestClose);
  useEffect(() => {
    const next = draftOf(job),
      prev = draftBase.current;
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    draftBase.current = next;
    setDraft((d) => rebaseForm(prev, next, d));
  }, [job.application?.draft, job.tailored, job.lang]);
  useEffect(() => {
    const next = job.notes || "",
      prev = notesBase.current;
    if (next === prev) return;
    notesBase.current = next;
    setNotes((n) => (n === prev ? next : n));
  }, [job.notes]);
  useEffect(() => {
    if (!offerBase.current) return;
    const next = offerForm(job),
      prev = offerBase.current;
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    offerBase.current = next;
    setOfferEdit((o) => (o ? rebaseForm(prev, next, o) : o));
  }, [job]);
  // The Faustus copilot: this job, the dialog tab, and what has been typed and not saved yet.
  useCopilotContext(() => {
    const offerChanged = offerEdit ? Object.keys(changedFields(offerBase.current, offerEdit)) : [];
    const draftChanged = dirty ? Object.keys(changedFields(draftBase.current, draft)) : [];
    return {
      view: { job_id: job.id, detail_tab: tab },
      editors: [
        offerEdit && { kind: "job-offer", object_id: job.id, dirty: offerChanged.length > 0, changed: offerChanged, fields: clipFields(offerEdit) },
        notes !== (job.notes || "") && { kind: "job-notes", object_id: job.id, dirty: true, fields: { notes: clip(notes, 1500) } },
        dirty && { kind: "job-draft", object_id: job.id, dirty: true, changed: draftChanged, fields: { lang: draft.lang, cvMarkdown: clip(draft.cvMarkdown, 1500), letterMarkdown: clip(draft.letterMarkdown, 1500), answers: (draft.answers || []).map((a) => ({ question: a.question, answer: clip(a.answer, 300) })), missing: draft.missing } },
      ].filter(Boolean),
    };
  });
  const action = async (name, fn) => {
    setBusy(name);
    try {
      await fn();
      await refresh();
      notify("Cambios guardados.", "info");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy("");
    }
  };
  const edit = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  return (
    <>
    <div className="dialog-scrim" aria-hidden="true" />
    <dialog
      ref={dialog}
      className="detail-dialog"
      aria-labelledby="application-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <div className="detail-header">
        <div className="section-heading">
          <span className={`status-badge ${job.status}`}>
            {statusLabel(job.status)}
          </span>
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label="Cerrar candidatura"
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="application-title">{job.title}</h2>
        <p>
          {job.company} · {job.location || modeLabel(job.workMode)}
        </p>
        <div className="detail-actions">
          {(job.applyUrl || job.url) && (
            <a
              className="btn-primary"
              href={job.applyUrl || job.url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir oferta
              <Icon name="external" />
            </a>
          )}
          <select
            aria-label="Estado de la candidatura"
            value={job.status}
            disabled={!!busy}
            onChange={(e) =>
              action("status", () =>
                api.patchJob(job.id, { status: e.target.value }),
              )
            }
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="section-tabs">
        {[
          ["offer", "Oferta"],
          ["draft", "Preparación"],
          ["activity", "Actividad"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="detail-body">
        {tab === "offer" && (
          <>
            <div className="section-heading"><h3>Datos de la oferta</h3>{!offerEdit && <button className="btn-ghost" onClick={() => { offerBase.current = offerForm(job); setOfferEdit(offerForm(job)); }}>Editar datos</button>}</div>
            {offerEdit && <form className="offer-editor inline-panel" onSubmit={(e) => { e.preventDefault(); action("offer", async () => { const body = changedFields(offerBase.current, offerEdit); if ("appliedAt" in body) body.appliedAt = body.appliedAt ? body.appliedAt + "T12:00:00" : null; if (Object.keys(body).length) await api.patchJob(job.id, body); setOfferEdit(null); offerBase.current = null; }); }}>
              <Field label="Puesto" required value={offerEdit.title} onChange={(e) => setOfferEdit({ ...offerEdit, title: e.target.value })} />
              <Field label="Empresa" value={offerEdit.company} onChange={(e) => setOfferEdit({ ...offerEdit, company: e.target.value })} />
              <div className="form-grid"><Field label="Modalidad"><select value={offerEdit.workMode} onChange={(e) => setOfferEdit({ ...offerEdit, workMode: e.target.value })}>{["remote", "hybrid", "onsite", "unknown"].map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}</select></Field><Field label="Ubicación" value={offerEdit.location} onChange={(e) => setOfferEdit({ ...offerEdit, location: e.target.value })} /></div>
              <Field label="Salario publicado" value={offerEdit.salary} onChange={(e) => setOfferEdit({ ...offerEdit, salary: e.target.value })} />
              <Field label="Enlace original" type="url" value={offerEdit.url} onChange={(e) => setOfferEdit({ ...offerEdit, url: e.target.value })} />
              <Field label="Fecha de envío" type="date" hint="Déjala vacía si no conoces la fecha real." value={offerEdit.appliedAt} onChange={(e) => setOfferEdit({ ...offerEdit, appliedAt: e.target.value })} />
              <Field label="Descripción"><textarea rows="7" value={offerEdit.description} onChange={(e) => setOfferEdit({ ...offerEdit, description: e.target.value })} /></Field>
              <div className="form-actions"><button className="btn-primary" disabled={!!busy || !offerEdit.title.trim()}>{busy === "offer" ? "Guardando…" : "Guardar datos"}</button><button className="btn-ghost" type="button" disabled={!!busy} onClick={() => { setOfferEdit(null); offerBase.current = null; }}>Cancelar</button></div>
            </form>}
            <div className="job-facts">
              <span>
                <small>Modalidad</small>
                {modeLabel(job.workMode)}
              </span>
              <span>
                <small>Salario</small>
                {job.salary || "No indicado"}
              </span>
              <span>
                <small>Fuente</small>
                {job.source}
              </span>
            </div>
            <section>
              <h3>Descripción</h3>
              <p className="preserve-lines">
                {job.description ||
                  "Todavía no hay descripción. Tu asistente puede leer la oferta y añadir sus requisitos."}
              </p>
            </section>
            <section>
              <div className="section-heading">
                <h3>Encaje con tu perfil</h3>
                <button
                  className="btn-ghost"
                  disabled={!!busy}
                  onClick={() => action("score", () => api.score(job.id))}
                >
                  {busy === "score" ? "Analizando…" : "Analizar encaje"}
                </button>
              </div>
              {job.scoreDetails ? (
                <>
                  <strong>
                    {job.score}/100 · {job.scoreDetails.verdict}
                  </strong>
                  <ul>
                    {job.scoreDetails.strengths?.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  {job.scoreDetails.gaps?.length > 0 && (
                    <p>Por revisar: {job.scoreDetails.gaps.join(" · ")}</p>
                  )}
                </>
              ) : (
                <p>
                  Tu IA conectada puede evaluar la oferta. El análisis desde
                  este botón usa el proveedor configurado en Ajustes.
                </p>
              )}
            </section>
            <Field label="Notas">
              <textarea
                rows="4"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() =>
                action("notes", () => api.patchJob(job.id, { notes }))
              }
            >
              Guardar notas
            </button>
          </>
        )}
        {tab === "draft" && (
          <>
            <div className="section-heading">
              <h3>CV y carta para esta oferta</h3>
              <button
                className="btn-ghost"
                disabled={!!busy || dirty}
                onClick={() =>
                  action("tailor", () => api.tailor(job.id, draft.lang))
                }
              >
                {busy === "tailor" ? "Preparando…" : "Generar con mi proveedor"}
              </button>
            </div>
            <p>
              Tu asistente conectado puede redactarlos aquí con tu contexto.
              Revisa el contenido y las respuestas antes de aprobar.
            </p>
            <Field label="Idioma">
              <select
                value={draft.lang}
                onChange={(e) => edit("lang", e.target.value)}
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </select>
            </Field>
            <Field label="CV adaptado">
              <textarea
                rows="10"
                value={draft.cvMarkdown}
                onChange={(e) => edit("cvMarkdown", e.target.value)}
              />
            </Field>
            <Field label="Carta de presentación">
              <textarea
                rows="9"
                value={draft.letterMarkdown}
                onChange={(e) => edit("letterMarkdown", e.target.value)}
              />
            </Field>
            {draft.answers.map((a, i) => (
              <Field
                key={i}
                label={a.question}
                hint={a.source ? `Referencia: ${a.source}` : undefined}
              >
                <textarea
                  rows="3"
                  value={a.answer}
                  onChange={(e) =>
                    edit(
                      "answers",
                      draft.answers.map((x, n) =>
                        n === i ? { ...x, answer: e.target.value } : x,
                      ),
                    )
                  }
                />
              </Field>
            ))}
            <Field label="Datos pendientes (uno por línea)">
              <textarea
                rows="3"
                value={draft.missing.join("\n")}
                onChange={(e) =>
                  edit("missing", e.target.value.split("\n").filter(Boolean))
                }
              />
            </Field>
            <div className="form-actions">
              <button
                className="btn-primary"
                disabled={!!busy || !dirty}
                onClick={() =>
                  action("save", async () => {
                    // The server replaces the whole draft: lay only the changed fields over the draft as it is now.
                    const fresh = (await api.state()).jobs.find((j) => j.id === job.id) || job;
                    await api.workspace(
                      `/api/jobs/${job.id}/draft`,
                      "PUT",
                      draftToSave(draftOf(fresh), draftBase.current, draft),
                    );
                    setDirty(false);
                  })
                }
              >
                Guardar borrador
              </button>
              {job.application?.draft && (
                <button
                  className="btn-ghost"
                  disabled={
                    !!busy ||
                    dirty ||
                    !!draft.missing.length ||
                    job.application.approvedDraftAt ===
                      job.application.draft.savedAt
                  }
                  onClick={() =>
                    action("approve", () =>
                      api.workspace(`/api/jobs/${job.id}/approve`, "POST", {}),
                    )
                  }
                >
                  {job.application.approvedDraftAt ===
                  job.application.draft.savedAt
                    ? "Borrador aprobado"
                    : "Aprobar para solicitar"}
                </button>
              )}
            </div>
            <div className="document-links">
              {job.tailored?.cvMarkdown && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/jobs/${job.id}/cv.html`}
                >
                  Ver CV / imprimir PDF
                  <Icon name="external" />
                </a>
              )}
              {job.tailored?.letterMarkdown && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/jobs/${job.id}/letter.html`}
                >
                  Ver carta / imprimir PDF
                  <Icon name="external" />
                </a>
              )}
            </div>
          </>
        )}
        {tab === "activity" && (
          <>
            <h3>Intentos del asistente</h3>
            {!job.application?.attempts?.length ? (
              <p>
                Sin intentos registrados. Preparar documentos no equivale a
                enviar una solicitud.
              </p>
            ) : (
              job.application.attempts.map((a) => (
                <div className="activity-entry" key={a.id}>
                  <strong>
                    {
                      {
                        submitted: "Enviada",
                        blocked: "Bloqueada",
                        unknown: "Envío por comprobar",
                        in_progress: "En curso",
                      }[a.state]
                    }
                  </strong>
                  <time>{new Date(a.startedAt).toLocaleString("es-ES")}</time>
                  <p>
                    {a.evidence ||
                      "Pendiente de resultado. Si la sesión se interrumpió, comprueba el portal antes de reintentar."}
                  </p>
                  {a.notes && <p>{a.notes}</p>}
                </div>
              ))
            )}
            <h3>Respuestas de la empresa</h3>
            {!job.responses?.length ? (
              <p>Sin respuestas registradas todavía.</p>
            ) : (
              job.responses.map((r) => (
                <div className="activity-entry" key={r.id}>
                  <strong>
                    {
                      {
                        ack: "Acuse de recibo",
                        info_request: "Petición de información",
                        rejection: "Rechazo",
                        interview: "Entrevista",
                        offer: "Oferta",
                        unknown: "Sin clasificar",
                      }[r.kind] || r.kind
                    }
                  </strong>
                  <time>{new Date(r.receivedAt).toLocaleString("es-ES")}</time>
                  <p>
                    {r.evidence.length > 280
                      ? `${r.evidence.slice(0, 280)}…`
                      : r.evidence}
                  </p>
                  {r.interviewAt && (
                    <p>
                      Entrevista: {new Date(r.interviewAt).toLocaleString("es-ES")}
                      {r.timezone ? ` (${r.timezone})` : ""}
                    </p>
                  )}
                  {r.notes && <p>{r.notes}</p>}
                </div>
              ))
            )}
            <h3>Historial de candidatura</h3>
            {job.history.map((h, i) => (
              <div className="history-row" key={i}>
                <span>{statusLabel(h.status)}</span>
                <time>{new Date(h.at).toLocaleString("es-ES")}</time>
              </div>
            ))}
            <div className="form-grid">
              <Field
                label="Próxima acción"
                type="date"
                value={localDateValue(job.nextActionAt)}
                disabled={!!busy}
                onChange={(e) =>
                  action("date", () =>
                    api.patchJob(job.id, {
                      nextActionAt: e.target.value || null,
                    }),
                  )
                }
              />
              <Field
                label="Entrevista"
                type="datetime-local"
                value={validDate(job.interviewAt) ? `${localDateValue(job.interviewAt)}T${String(new Date(job.interviewAt).getHours()).padStart(2, "0")}:${String(new Date(job.interviewAt).getMinutes()).padStart(2, "0")}` : ""}
                disabled={!!busy}
                onChange={(e) =>
                  action("interview", () =>
                    api.patchJob(job.id, {
                      interviewAt: e.target.value || null,
                    }),
                  )
                }
              />
            </div>
            <div className="form-actions">
              <button
                className="btn-ghost"
                disabled={!!busy}
                onClick={() =>
                  action("prep", () => api.prep(job.id, draft.lang))
                }
              >
                {busy === "prep" ? "Preparando…" : "Preparar entrevista"}
              </button>
              {job.interviewPrep && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/jobs/${job.id}/prep.html`}
                >
                  Ver preparación
                </a>
              )}
              <button
                className="btn-ghost"
                disabled={!!busy}
                onClick={() =>
                  action("followup", () => api.followup(job.id, draft.lang))
                }
              >
                Redactar seguimiento
              </button>
            </div>
            {job.followup && (
              <section>
                <h3>{job.followup.subject}</h3>
                <p className="preserve-lines">{job.followup.body}</p>
              </section>
            )}
          </>
        )}
      </div>
    </dialog>
    </>
  );
}
