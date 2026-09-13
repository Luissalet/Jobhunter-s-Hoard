import { useEffect, useState } from "react";
import { useUnsavedChanges } from "../useUnsavedChanges.js";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
import LettersLibrary from "./LettersLibrary.jsx";
export function Field({ label, children, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
const defaults = {
  roles: "",
  locations: "",
  remote: "preferred",
  hybrid: "ask",
  onsite: "ask",
  relocate: "ask",
  salaryMin: null,
  salaryTarget: null,
  currency: "EUR",
  excludedCompanies: "",
  automation: "review",
  dailyLimit: 10,
  extra: "",
};
const emptySource = {
  kind: "folder",
  label: "",
  path: "",
  url: "",
  content: "",
  summary: "",
  role: "reference",
  enabled: true,
};
function AnswerRow({
  answer: a,
  job,
  editing,
  edit,
  setEdit,
  conflict,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDiscardConflict,
  onRemove,
  onCopy,
}) {
  const pending = a.needsReview || !a.answer?.trim();
  const when = a.updatedAt || a.learnedAt;
  return (
    <div className="answer-row">
      <div>
        <div className="answer-meta">
          <span className="status-badge">{a.scope === "profile" ? "Perfil" : "Candidatura"}</span>
          {pending && <span className="status-badge answered">Pendiente</span>}
          {a.source && <span>{a.source}</span>}
          {job && (
            <span>
              Oferta: {job.title}
              {job.company ? ` · ${job.company}` : ""}
            </span>
          )}
          {when && <span>{new Date(when).toLocaleDateString()}</span>}
        </div>
        {editing ? (
          <>
            <Field
              label="Editar pregunta"
              value={edit.question}
              onChange={(e) => setEdit((d) => ({ ...d, question: e.target.value }))}
            />
            <Field label="Editar respuesta">
              <textarea
                rows="4"
                value={edit.answer}
                onChange={(e) => setEdit((d) => ({ ...d, answer: e.target.value }))}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={edit.scope === "profile"}
                onChange={(e) =>
                  setEdit((d) => ({
                    ...d,
                    scope: e.target.checked ? "profile" : "application",
                  }))
                }
              />{" "}
              Respuesta de perfil (válida para cualquier candidatura)
            </label>
            {conflict && (
              <p className="supporting-copy">
                Otra tarea cambió esta respuesta; recarga. Valor actual:{" "}
                {conflict.current.answer || "(sin respuesta)"}.{" "}
                <button className="text-action" onClick={onDiscardConflict}>
                  Recargar
                </button>
              </p>
            )}
            <div className="form-actions">
              <button className="btn-primary" onClick={onSaveEdit}>
                Guardar cambios
              </button>
              <button className="btn-ghost" type="button" onClick={onCancelEdit}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <strong>{a.question}</strong>
            <p>{a.answer || "Sin respuesta todavía."}</p>
          </>
        )}
      </div>
      {!editing && (
        <div className="answer-actions">
          <button className="text-action" onClick={onCopy}>
            Copiar
          </button>
          <button className="text-action" onClick={onStartEdit}>
            Editar
          </button>
          <button className="text-action muted" onClick={onRemove}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}
const sections = [
  ["profile", "Perfil personal"],
  ["preferences", "Lo que busco"],
  ["instructions", "Instrucciones"],
  ["sources", "Fuentes"],
  ["answers", "Respuestas"],
  ["letters", "Cartas"],
];
export default function WorkspaceTab({
  context,
  state,
  refresh,
  notify,
  changeContext,
  onDirty,
}) {
  const [section, setSection] = useState("profile"),
    // answers ya no viaja dentro de `draft`: cada respuesta se añade, edita
    // o borra con su propio endpoint (ver más abajo) para que un "Guardar
    // cambios" nunca reenvíe una copia obsoleta por encima de una edición
    // más reciente hecha desde otra pestaña o por el asistente.
    [draft, setDraft] = useState(() => {
      const { answers: _omit, ...rest } = context;
      return {
        ...rest,
        preferences: { ...defaults, ...context.preferences },
        letters: context.letters || [],
      };
    }),
    [answers, setAnswers] = useState([]),
    [answersLoading, setAnswersLoading] = useState(false),
    [onlyPending, setOnlyPending] = useState(false),
    [editingAnswerId, setEditingAnswerId] = useState(null),
    [answerEdit, setAnswerEdit] = useState(null),
    [answerConflict, setAnswerConflict] = useState(null),
    [recovering, setRecovering] = useState(false),
    [recoverReport, setRecoverReport] = useState(null),
    [personal, setPersonal] = useState(state.settings.personal),
    [profile, setProfile] = useState(state.profile),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [picking, setPicking] = useState(false),
    [source, setSource] = useState(emptySource),
    [showSource, setShowSource] = useState(false),
    [sourcePreview, setSourcePreview] = useState(null),
    [newName, setNewName] = useState(""),
    [newOpen, setNewOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [answerQuery, setAnswerQuery] = useState(""),
    [answer, setAnswer] = useState("");
  const pendingSource = !!(
    source.label ||
    source.path ||
    source.url ||
    source.content ||
    source.summary
  );
  const pending =
    dirty || pendingSource || !!question || !!answer || !!newName || !!editingAnswerId;
  useUnsavedChanges(pending);
  useEffect(() => {
    onDirty(pending);
    return () => onDirty(false);
  }, [pending, onDirty]);
  const set = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  const pref = (key, value) =>
    set("preferences", { ...draft.preferences, [key]: value });
  // Respuestas: cada operación pasa por su propio endpoint y recarga la
  // lista; nunca viajan dentro del guardado general del contexto.
  const loadAnswers = async () => {
    setAnswersLoading(true);
    try {
      const res = await api.workspace(`/api/contexts/${context.id}/answers`);
      setAnswers(res.answers || []);
    } catch (e) {
      notify(e.message);
    } finally {
      setAnswersLoading(false);
    }
  };
  useEffect(() => {
    loadAnswers();
    setEditingAnswerId(null);
    setAnswerConflict(null);
    setRecoverReport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.id]);
  const addAnswer = async () => {
    try {
      const res = await api.workspace(`/api/contexts/${context.id}/answers`, "POST", {
        entry: { question, answer },
      });
      setQuestion("");
      setAnswer("");
      await loadAnswers();
      notify(
        res.added ? "Respuesta añadida." : "Ya existía una respuesta igual; no se duplicó.",
        "info",
      );
    } catch (e) {
      notify(e.message);
    }
  };
  const startAnswerEdit = (a) => {
    setEditingAnswerId(a.id);
    setAnswerEdit({ question: a.question, answer: a.answer, scope: a.scope });
    setAnswerConflict(null);
  };
  const saveAnswerEdit = async (a) => {
    try {
      await api.workspace(`/api/contexts/${context.id}/answers/${a.id}`, "PATCH", {
        ...answerEdit,
        ifRevision: a.revision ?? 0,
      });
      setEditingAnswerId(null);
      setAnswerEdit(null);
      setAnswerConflict(null);
      await loadAnswers();
      notify("Respuesta actualizada.", "info");
    } catch (e) {
      if (e.status === 409 && e.body?.conflict) {
        setAnswerConflict({ answerId: a.id, current: e.body.current });
      } else notify(e.message);
    }
  };
  const discardConflict = async () => {
    setAnswerConflict(null);
    setEditingAnswerId(null);
    await loadAnswers();
  };
  const removeAnswer = async (a) => {
    try {
      await api.workspace(`/api/contexts/${context.id}/answers/${a.id}`, "DELETE");
      await loadAnswers();
      notify("Respuesta eliminada.", "info");
    } catch (e) {
      notify(e.message);
    }
  };
  const runRecover = async (force) => {
    setRecovering(true);
    try {
      const report = await api.workspace(
        `/api/contexts/${context.id}/answers/recover${force ? "?force=1" : ""}`,
        "POST",
        {},
      );
      setRecoverReport(report);
      await loadAnswers();
      notify(`Recuperación completada: ${report.added} respuesta(s) nueva(s).`, "info");
    } catch (e) {
      notify(e.message);
    } finally {
      setRecovering(false);
    }
  };
  const answerKey = (s) =>
    String(s || "")
      .normalize("NFKC")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase()
      .replace(/[¿?*]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const answerGroups = (() => {
    const q = answerQuery.toLocaleLowerCase();
    const visible = answers.filter((a) => {
      if (onlyPending && !(a.needsReview || !a.answer?.trim())) return false;
      return `${a.question} ${a.answer}`.toLocaleLowerCase().includes(q);
    });
    const byKey = new Map();
    for (const a of visible) {
      const k = answerKey(a.question);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(a);
    }
    return [...byKey.values()];
  })();
  const save = async () => {
    setBusy(true);
    try {
      await api.workspace(`/api/contexts/${context.id}`, "PUT", draft);
      await api.saveSettings({ personal });
      await api.saveProfile(profile);
      await refresh();
      setDirty(false);
      notify("Contexto y perfil guardados.", "info");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addSource = async (e) => {
    e.preventDefault();
    if (["file", "folder"].includes(source.kind) && !source.path.trim()) {
      notify("Elige primero un archivo o una carpeta.");
      return;
    }
    setBusy(true);
    try {
      await api.workspace(
        `/api/contexts/${context.id}/sources`,
        "POST",
        source,
      );
      await refresh();
      setSource(emptySource);
      setShowSource(false);
      notify("Fuente enlazada. Se leerá su contenido actual.", "info");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const browseSource = async () => {
    setPicking(true);
    const kind = source.kind;
    try {
      const selected = await api.workspace("/api/sources/pick", "POST", { kind });
      if (!selected.cancelled) {
        setSource((s) => s.kind === kind ? {
          ...s,
          path: selected.path,
          label: s.label || selected.label,
        } : s);
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setPicking(false);
    }
  };
  const sourceAction = async (s, action) => {
    try {
      if (action === "read")
        setSourcePreview({
          source: s,
          result: await api.workspace(
            `/api/contexts/${context.id}/sources/${s.id}/${s.kind === "folder" ? "files" : "read"}`,
          ),
        });
      else {
        await api.workspace(
          `/api/contexts/${context.id}/sources/${s.id}`,
          action === "remove" ? "DELETE" : "PATCH",
          action === "remove" ? undefined : { enabled: !s.enabled },
        );
        await refresh();
      }
    } catch (e) {
      notify(e.message);
    }
  };
  const create = async (e) => {
    e.preventDefault();
    if (dirty || pendingSource || question || answer) {
      notify("Guarda tus cambios antes de crear otro contexto.");
      return;
    }
    try {
      const c = await api.workspace("/api/contexts", "POST", { name: newName });
      await refresh();
      await changeContext(c.id, true);
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="workspace-page context-page">
      <div className="page-heading">
        <div>
          <h1>Mi contexto</h1>
          <p>Tu trayectoria y tus prioridades, listas para cada candidatura.</p>
        </div>
        <button className="btn-ghost" onClick={() => setNewOpen(!newOpen)}>
          <Icon name="plus" />
          Nuevo contexto
        </button>
      </div>
      {newOpen && (
        <form className="inline-create" onSubmit={create}>
          <Field
            label="Nombre del nuevo contexto"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            placeholder="Por ejemplo: IA · España"
          />
          <button className="btn-primary">Crear contexto</button>
        </form>
      )}
      <div className="context-intro">
        <div>
          <Icon name="folder" />
          <strong>{context.name}</strong>
          <span>
            {context.sources?.filter((s) => s.enabled).length || 0} fuentes
            activas
          </span>
        </div>
        <p>
          El perfil personal se comparte entre búsquedas. Las instrucciones,
          fuentes y preferencias pertenecen a este contexto.
        </p>
      </div>
      <div
        className="section-tabs"
        role="tablist"
        aria-label="Secciones del contexto"
      >
        {sections.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={section === id}
            key={id}
            onClick={() => setSection(id)}
            className={section === id ? "selected" : ""}
          >
            {label}
            {id === "sources" && <span>{context.sources?.length || 0}</span>}
          </button>
        ))}
      </div>
      <div className="context-editor" role="tabpanel">
        {section === "letters" && <LettersLibrary letters={draft.letters} onChange={(letters) => set("letters", letters)} notify={notify} />}
        {section === "profile" && (
          <>
            <div className="editor-heading">
              <h2>Quién eres</h2>
              <p>
                Datos que tu asistente puede reutilizar al completar
                formularios. Deja vacío lo que todavía no quieras incluir.
              </p>
            </div>
            <div className="form-grid">
              {[
                ["name", "Nombre completo"],
                ["email", "Correo electrónico"],
                ["phone", "Teléfono"],
                ["location", "Ciudad y país"],
                ["linkedin", "Perfil de LinkedIn"],
                ["portfolio", "Portfolio"],
                ["github", "GitHub"],
                ["address", "Dirección"],
                ["postalCode", "Código postal"],
                ["workAuthorization", "Permiso de trabajo"],
                ["noticePeriod", "Disponibilidad / preaviso"],
                ["languages", "Idiomas y nivel"],
              ].map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type={key === "email" ? "email" : "text"}
                  value={personal[key] || ""}
                  onChange={(e) => {
                    setPersonal((p) => ({ ...p, [key]: e.target.value }));
                    setDirty(true);
                  }}
                />
              ))}
            </div>
            <Field
              label="Trayectoria profesional"
              hint="Experiencia, formación, habilidades y resultados reales. Los CVs y proyectos enlazados amplían esta información."
            >
              <textarea
                rows="12"
                value={profile}
                onChange={(e) => {
                  setProfile(e.target.value);
                  setDirty(true);
                }}
                placeholder="Resume tu experiencia o enlaza tus CVs en Fuentes."
              />
            </Field>
          </>
        )}
        {section === "preferences" && (
          <>
            <div className="editor-heading">
              <h2>Un trabajo que encaje contigo</h2>
              <p>
                Estas condiciones acompañan a la IA cuando evalúa ofertas y
                prepara solicitudes.
              </p>
            </div>
            <div className="form-grid">
              <Field
                label="Puestos de interés"
                value={draft.preferences.roles}
                onChange={(e) => pref("roles", e.target.value)}
                placeholder="AI Engineer, desarrollo de software…"
              />
              <Field
                label="Ciudades y países"
                value={draft.preferences.locations}
                onChange={(e) => pref("locations", e.target.value)}
                placeholder="España, Unión Europea…"
              />
              <Field label="Trabajo remoto">
                <select
                  value={draft.preferences.remote}
                  onChange={(e) => pref("remote", e.target.value)}
                >
                  <option value="preferred">Priorizar remoto</option>
                  <option value="only">Solo remoto</option>
                  <option value="any">Sin preferencia</option>
                </select>
              </Field>
              {[
                ["hybrid", "Trabajo híbrido"],
                ["onsite", "Trabajo presencial"],
                ["relocate", "Cambiar de residencia"],
              ].map(([key, label]) => (
                <Field label={label} key={key}>
                  <select
                    value={draft.preferences[key]}
                    onChange={(e) => pref(key, e.target.value)}
                  >
                    <option value="ask">Consultar antes</option>
                    <option value="yes">Sí, lo acepto</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              ))}
              <Field
                label="Salario mínimo bruto anual"
                type="number"
                min="0"
                value={draft.preferences.salaryMin ?? ""}
                onChange={(e) =>
                  pref(
                    "salaryMin",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="Sin definir"
              />
              <Field
                label="Salario objetivo bruto anual"
                type="number"
                min="0"
                value={draft.preferences.salaryTarget ?? ""}
                onChange={(e) =>
                  pref(
                    "salaryTarget",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="Sin definir"
              />
              <Field label="Moneda">
                <select
                  value={draft.preferences.currency}
                  onChange={(e) => pref("currency", e.target.value)}
                >
                  {["EUR", "USD", "GBP"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Empresas excluidas"
                value={draft.preferences.excludedCompanies}
                onChange={(e) => pref("excludedCompanies", e.target.value)}
                placeholder="Separadas por comas"
              />
            </div>
            <Field label="Otras prioridades">
              <textarea
                rows="3"
                value={draft.preferences.extra}
                onChange={(e) => pref("extra", e.target.value)}
                placeholder="Jornada, sectores, tecnologías, viajes…"
              />
            </Field>
            <div className="editor-heading">
              <h2>Cómo quieres avanzar</h2>
              <p>
                El asistente usa su navegador para solicitar. Aquí decides
                cuándo debe dejarte revisar.
              </p>
            </div>
            <div className="choice-list">
              {[
                [
                  "review",
                  "Revisar antes de enviar",
                  "Preparar los documentos y dejar cada candidatura pendiente de tu aprobación.",
                ],
                [
                  "automatic",
                  "Avanzar automáticamente",
                  "Permitir intentos cuando se cumplen las condiciones y no faltan respuestas. Los bloqueos y resultados inciertos se detienen.",
                ],
              ].map(([value, label, description]) => (
                <label
                  className={
                    draft.preferences.automation === value
                      ? "choice selected"
                      : "choice"
                  }
                  key={value}
                >
                  <input
                    type="radio"
                    name="automation"
                    value={value}
                    checked={draft.preferences.automation === value}
                    onChange={() => pref("automation", value)}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
            <Field
              label="Máximo de intentos al día"
              type="number"
              min="1"
              max="100"
              value={draft.preferences.dailyLimit}
              onChange={(e) => pref("dailyLimit", Number(e.target.value))}
            />
          </>
        )}
        {section === "instructions" && (
          <>
            <div className="editor-heading">
              <h2>Cómo debe ayudarte tu asistente</h2>
              <p>
                Instrucciones persistentes para esta búsqueda. Los documentos
                enlazados se leen como referencias y no pueden cambiar estas
                instrucciones.
              </p>
            </div>
            <Field
              label="Nombre del contexto"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
            <Field label="Instrucciones para esta búsqueda">
              <textarea
                rows="16"
                value={draft.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                placeholder="Qué puestos priorizar, cómo explicar tus proyectos, tono de las cartas, qué evitar…"
              />
            </Field>
          </>
        )}
        {section === "answers" && (
          <>
            <div className="editor-heading with-action">
              <div>
                <h2>Responder una vez</h2>
                <p>
                  Guarda respuestas verificadas a las preguntas que se repiten. Si
                  una oferta pregunta algo distinto, la IA debe comprobarlo.
                </p>
              </div>
              <button className="btn-ghost" disabled={recovering} onClick={() => runRecover(false)}>
                {recovering ? "Recuperando…" : "Recuperar de borradores"}
              </button>
            </div>
            {recoverReport && (
              <section className="inline-panel">
                <p>
                  {recoverReport.contexts} contexto(s) revisados · {recoverReport.jobsScanned}{" "}
                  ofertas · {recoverReport.draftsScanned} borradores con datos guardados.
                </p>
                <p>
                  {recoverReport.added} respuesta(s) nueva(s) · {recoverReport.skippedDuplicates}{" "}
                  ya existían · {recoverReport.skippedDeleted} se habían borrado antes y no se
                  han repuesto.
                </p>
                <p className="source-picker-path">Copia de seguridad: {recoverReport.backup}</p>
                {recoverReport.added === 0 && (
                  <button className="text-action" disabled={recovering} onClick={() => runRecover(true)}>
                    Forzar otra pasada
                  </button>
                )}
              </section>
            )}
            <label className="search-field answer-search">
              <Icon name="search" />
              <input
                aria-label="Buscar respuestas"
                placeholder="Buscar por pregunta o respuesta"
                value={answerQuery}
                onChange={(e) => setAnswerQuery(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
              />{" "}
              Solo pendientes
            </label>
            <p className="supporting-copy">
              {answersLoading
                ? "Cargando respuestas…"
                : `${answerGroups.reduce((n, g) => n + g.length, 0)} de ${answers.length} respuestas`}
            </p>
            {answerGroups.map((group) => {
              const rows = group.map((a) => (
                <AnswerRow
                  key={a.id}
                  answer={a}
                  job={a.jobId ? state.jobs.find((j) => j.id === a.jobId) : null}
                  editing={editingAnswerId === a.id}
                  edit={answerEdit}
                  setEdit={setAnswerEdit}
                  conflict={answerConflict?.answerId === a.id ? answerConflict : null}
                  onStartEdit={() => startAnswerEdit(a)}
                  onCancelEdit={() => {
                    setEditingAnswerId(null);
                    setAnswerConflict(null);
                  }}
                  onSaveEdit={() => saveAnswerEdit(a)}
                  onDiscardConflict={discardConflict}
                  onRemove={() => removeAnswer(a)}
                  onCopy={async () => {
                    try {
                      await navigator.clipboard.writeText(a.answer);
                      notify("Respuesta copiada.", "info");
                    } catch {
                      notify("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
                    }
                  }}
                />
              ));
              if (group.length === 1) return rows[0];
              return (
                <details className="answer-variants" key={group[0].id}>
                  <summary>{group.length} variantes de "{group[0].question}"</summary>
                  {rows}
                </details>
              );
            })}
            <Field
              label="Pregunta habitual"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="¿Cuándo podrías incorporarte?"
            />
            <Field label="Tu respuesta">
              <textarea rows="3" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </Field>
            <button className="btn-ghost" disabled={!question.trim() || !answer.trim()} onClick={addAnswer}>
              <Icon name="plus" />
              Añadir respuesta
            </button>
          </>
        )}
        {section === "sources" && (
          <>
            <div className="editor-heading with-action">
              <div>
                <h2>Lo que respalda tu trayectoria</h2>
                <p>
                  Enlaza CVs, proyectos, estudios o experiencia. Los archivos se
                  leen en su versión actual, sin modificar los originales.
                </p>
              </div>
              <button
                className="btn-primary"
                onClick={() => setShowSource(!showSource)}
              >
                <Icon name="plus" />
                Enlazar fuente
              </button>
            </div>
            {!context.sources?.length && !showSource && (
              <div className="source-empty">
                <Icon name="folder" width="32" height="32" />
                <h3>Tu experiencia no cabe en un único CV</h3>
                <p>
                  Añade una carpeta de proyectos, un CV actualizado o el texto
                  de tu perfil de LinkedIn. Tu asistente podrá consultar cada
                  fuente cuando la necesite.
                </p>
                <button
                  className="btn-ghost"
                  onClick={() => setShowSource(true)}
                >
                  Enlazar mi primera fuente
                </button>
              </div>
            )}
            {context.sources?.map((s) => (
              <div className="source-row" key={s.id}>
                <Icon name={s.kind === "folder" ? "folder" : "file"} />
                <div>
                  <strong>{s.label}</strong>
                  <small>{s.path || s.url || "Nota de contexto"}</small>
                  <span>
                    {{cv:"CV",project:"Proyecto",education:"Formación",experience:"Experiencia",profile:"Perfil profesional",reference:"Referencia"}[s.role] || "Referencia"} ·{" "}
                    {s.enabled ? "Disponible para la IA" : "Desactivada"}
                  </span>
                </div>
                <div className="source-actions">
                  <button
                    className="text-action"
                    disabled={!s.enabled}
                    onClick={() => sourceAction(s, "read")}
                  >
                    Ver
                  </button>
                  <button
                    className="text-action"
                    onClick={() => sourceAction(s, "toggle")}
                  >
                    {s.enabled ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    className="text-action muted"
                    onClick={() => sourceAction(s, "remove")}
                  >
                    Desenlazar
                  </button>
                </div>
              </div>
            ))}
            {showSource && (
              <form className="source-form" onSubmit={addSource}>
                <div className="form-grid">
                  <Field label="Tipo de fuente">
                    <select
                      value={source.kind}
                      disabled={picking}
                      onChange={(e) =>
                        setSource((s) => ({ ...s, kind: e.target.value, path: "" }))
                      }
                    >
                      <option value="folder">Carpeta local</option>
                      <option value="file">Archivo local</option>
                      <option value="url">Enlace web</option>
                      <option value="note">Nota</option>
                    </select>
                  </Field>
                  <Field
                    label="Nombre"
                    required
                    value={source.label}
                    onChange={(e) =>
                      setSource((s) => ({ ...s, label: e.target.value }))
                    }
                    placeholder="CV actualizado · español"
                  />
                  <Field label="Contenido">
                    <select
                      value={source.role}
                      onChange={(e) =>
                        setSource((s) => ({ ...s, role: e.target.value }))
                      }
                    >
                      {[
                        ["cv", "CV"],
                        ["project", "Proyecto"],
                        ["education", "Universidad / formación"],
                        ["experience", "Experiencia laboral"],
                        ["profile", "Perfil profesional"],
                        ["reference", "Otra referencia"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {["file", "folder"].includes(source.kind) && (
                  <div className="source-picker">
                    <button type="button" className="btn-primary" onClick={browseSource} disabled={picking}>
                      <Icon name={source.kind === "folder" ? "folder" : "file"} />
                      {picking ? "Selector abierto en Windows…" : source.path ? "Cambiar selección…" : source.kind === "folder" ? "Elegir carpeta…" : "Elegir archivo…"}
                    </button>
                    <p role="status" className="source-picker-path">
                      {picking ? "Elige la fuente en la ventana de Windows. También puedes cancelar allí." : source.path || "Se abrirá el explorador de Windows. El nombre se rellenará al elegir la fuente."}
                    </p>
                    <details>
                      <summary>Introducir ruta manualmente</summary>
                      <Field label="Ruta completa en este equipo" value={source.path} disabled={picking}
                        onChange={(e) => setSource((s) => ({ ...s, path: e.target.value }))}
                        placeholder="C:\Users\…\CVs actualizados"
                        hint="PDF, DOCX, Markdown, texto y código. Las carpetas se consultan bajo demanda."
                      />
                    </details>
                  </div>
                )}
                {source.kind === "url" && (
                  <Field
                    label="Enlace"
                    type="url"
                    required
                    value={source.url}
                    onChange={(e) =>
                      setSource((s) => ({ ...s, url: e.target.value }))
                    }
                    placeholder="https://www.linkedin.com/in/…"
                  />
                )}
                {["note", "url"].includes(source.kind) && (
                  <Field
                    label={
                      source.kind === "url"
                        ? "Texto del perfil o de la página"
                        : "Contenido de la nota"
                    }
                    hint={
                      source.kind === "url"
                        ? "Pega el contenido relevante. Guardar un enlace no descarga la página ni inicia sesión."
                        : undefined
                    }
                  >
                    <textarea
                      rows="6"
                      required={source.kind === "note"}
                      value={source.content}
                      onChange={(e) =>
                        setSource((s) => ({ ...s, content: e.target.value }))
                      }
                    />
                  </Field>
                )}
                <Field
                  label="Qué aporta esta fuente"
                  value={source.summary}
                  onChange={(e) =>
                    setSource((s) => ({ ...s, summary: e.target.value }))
                  }
                />
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowSource(false)}
                  >
                    Cancelar
                  </button>
                  <button className="btn-primary" disabled={busy || picking}>
                    {busy ? "Enlazando…" : "Guardar fuente"}
                  </button>
                </div>
              </form>
            )}
            {sourcePreview && (
              <section className="source-preview">
                <div className="section-heading">
                  <h3>{sourcePreview.source.label}</h3>
                  <button
                    className="icon-button"
                    aria-label="Cerrar vista previa"
                    onClick={() => setSourcePreview(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {sourcePreview.result.files ? (
                  <>
                    <p>
                      {sourcePreview.result.files.length} archivos disponibles
                      {sourcePreview.result.truncated
                        ? " · listado parcial"
                        : ""}
                    </p>
                    <ul>
                      {sourcePreview.result.files.map((file) => (
                        <li key={file}>
                          <button
                            className="text-action"
                            onClick={async () => {
                              try {
                                setSourcePreview({
                                  source: sourcePreview.source,
                                  result: await api.workspace(
                                    `/api/contexts/${context.id}/sources/${sourcePreview.source.id}/read?file=${encodeURIComponent(file)}`,
                                  ),
                                });
                              } catch (e) {
                                notify(e.message);
                              }
                            }}
                          >
                            {file}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <pre>
                      {sourcePreview.result.content ||
                        "Sin texto pegado. El enlace queda disponible para tu asistente."}
                    </pre>
                    {sourcePreview.result.truncated && (
                      <p>
                        Vista previa parcial. La IA puede continuar leyendo por
                        páginas.
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {(section !== "sources" || dirty) && (
        <div className="save-bar">
          <span>
            {dirty
              ? "Cambios de perfil o contexto sin guardar"
              : "La IA utiliza la última versión guardada."}
          </span>
          <button
            className="btn-primary"
            disabled={busy || !dirty}
            onClick={save}
          >
            <Icon name="check" />
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
