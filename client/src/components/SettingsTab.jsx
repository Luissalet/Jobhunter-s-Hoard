import { useState } from "react";
import { api } from "../api.js";
import { Field } from "./WorkspaceTab.jsx";
const presets = {
  mistral: ["Mistral", "https://api.mistral.ai/v1", "mistral-small-latest"],
  groq: ["Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"],
  openrouter: ["OpenRouter", "https://openrouter.ai/api/v1", ""],
  custom: ["Personalizado", "", ""],
};
export default function SettingsTab({ state, setState, notify }) {
  const [s, setS] = useState(state.settings),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const { personal, ...options } = s;
      const settings = await api.saveSettings(options);
      setState((prev) => ({ ...prev, settings }));
      notify("Ajustes guardados.", "info");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-editor">
      <section>
        <h2>Generación desde Jubhunter's Hoard</h2>
        <p>
          Opcional. Configura un proveedor para los botones de análisis, CV,
          cartas y entrevistas de esta aplicación. Un asistente conectado por
          MCP utiliza su propio modelo.
        </p>
        <Field label="Motor de IA">
          <select
            value={s.provider}
            onChange={(e) => set("provider", e.target.value)}
          >
            <option value="openai">
              API compatible (Mistral, Groq, OpenRouter…)
            </option>
            <option value="ollama">Ollama en este equipo</option>
            <option value="gemini">Gemini</option>
          </select>
        </Field>
        {s.provider === "openai" && (
          <>
            <Field label="Proveedor">
              <select
                value={s.oaiPreset || "mistral"}
                onChange={(e) => {
                  const id = e.target.value,
                    p = presets[id];
                  setS((prev) => ({
                    ...prev,
                    oaiPreset: id,
                    ...(id === "custom"
                      ? {}
                      : { oaiBaseUrl: p[1], oaiModel: p[2] }),
                  }));
                }}
              >
                {Object.entries(presets).map(([id, p]) => (
                  <option value={id} key={id}>
                    {p[0]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field
                label="URL de la API"
                value={s.oaiBaseUrl}
                onChange={(e) => set("oaiBaseUrl", e.target.value)}
              />
              <Field
                label="Modelo"
                value={s.oaiModel}
                onChange={(e) => set("oaiModel", e.target.value)}
              />
            </div>
            <Field
              label="Clave de API"
              type="password"
              autoComplete="off"
              value={s.oaiKey}
              onChange={(e) => set("oaiKey", e.target.value)}
            />
          </>
        )}
        {s.provider === "ollama" && (
          <div className="form-grid">
            <Field
              label="URL de Ollama"
              value={s.ollamaUrl}
              onChange={(e) => set("ollamaUrl", e.target.value)}
            />
            <Field
              label="Modelo local"
              value={s.ollamaModel}
              onChange={(e) => set("ollamaModel", e.target.value)}
            />
          </div>
        )}
        {s.provider === "gemini" && (
          <div className="form-grid">
            <Field
              label="Clave de Gemini"
              type="password"
              value={s.geminiKey}
              onChange={(e) => set("geminiKey", e.target.value)}
            />
            <Field
              label="Modelo de Gemini"
              value={s.geminiModel}
              onChange={(e) => set("geminiModel", e.target.value)}
            />
          </div>
        )}
        <p className="settings-note">
          Al usar un proveedor externo, se le envían el perfil, las preferencias
          y las referencias incluidas en el dossier de esa candidatura. Las
          carpetas se consultan bajo demanda por MCP.
        </p>
      </section>
      <section>
        <h2>Fuentes y objetivo</h2>
        <p>
          Adzuna es opcional. Las otras fuentes de búsqueda no requieren esta
          clave.
        </p>
        <div className="form-grid">
          <Field
            label="Adzuna App ID"
            value={s.adzunaAppId}
            onChange={(e) => set("adzunaAppId", e.target.value)}
          />
          <Field
            label="Adzuna App Key"
            type="password"
            value={s.adzunaAppKey}
            onChange={(e) => set("adzunaAppKey", e.target.value)}
          />
          <Field
            label="País de Adzuna"
            value={s.adzunaCountry}
            onChange={(e) => set("adzunaCountry", e.target.value)}
          />
          <Field
            label="Objetivo semanal de candidaturas"
            type="number"
            min="0"
            value={s.weeklyGoal}
            onChange={(e) => set("weeklyGoal", Number(e.target.value))}
          />
        </div>
      </section>
      <section>
        <h2>Copia de seguridad</h2>
        <p>
          Incluye perfil, contextos, fuentes enlazadas, respuestas, candidaturas
          y ajustes. Los archivos originales de las carpetas no se incluyen en
          la copia.
        </p>
        <div className="form-actions">
          <a className="btn-ghost" href="/api/backup">
            Descargar copia
          </a>
          <label className="btn-ghost">
            Restaurar copia
            <input
              type="file"
              className="hidden"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (
                  !window.confirm(
                    "Restaurar sustituye los datos actuales por los de esta copia. ¿Continuar?",
                  )
                ) {
                  e.target.value = "";
                  return;
                }
                try {
                  await api.restore(JSON.parse(await file.text()));
                  window.location.reload();
                } catch (err) {
                  notify(err.message);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      <div className="save-bar">
        <span>Los datos de tu candidatura se editan en Mi contexto.</span>
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar ajustes"}
        </button>
      </div>
    </div>
  );
}
