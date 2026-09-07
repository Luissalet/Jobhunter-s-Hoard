import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./Icon.jsx";
export default function ConnectionTab({ notify }) {
  const [connection, setConnection] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      api
        .workspace("/api/agent/config")
        .then(setConnection)
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copiado al portapapeles.", "info");
    } catch {
      notify("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
    }
  };
  const prompt =
    "Usa Jubhunter's Hoard para consultar mis contextos y preferencias. Lee mi perfil y las fuentes pertinentes. Busca ofertas que encajen, lee su descripción con tu navegador y regístralas sin duplicados. Prepara cartas y respuestas basadas en mis datos reales. Respeta el modo de revisión del contexto. Registra cada intento y marca enviada solo cuando veas la confirmación del portal. Si falta información, deja la candidatura pendiente y continúa con otra.";
  return (
    <div className="workspace-page connection-page">
      <div className="page-heading">
        <div>
          <h1>Tu asistente, con contexto</h1>
          <p>
            Conecta una IA con navegador y deja de empezar cada solicitud desde
            cero.
          </p>
        </div>
      </div>
      <div className="connection-flow">
        <div>
          <Icon name="folder" />
          <strong>Tu contexto</strong>
          <small>Perfil, fuentes y preferencias</small>
        </div>
        <Icon name="arrow" />
        <div>
          <Icon name="connect" />
          <strong>Tu asistente</strong>
          <small>Lee, redacta y usa su navegador</small>
        </div>
        <Icon name="arrow" />
        <div>
          <Icon name="briefcase" />
          <strong>Tus candidaturas</strong>
          <small>Documentos, intentos y seguimiento</small>
        </div>
      </div>
      <div className="connection-layout">
        <section>
          <h2>Conectar por MCP</h2>
          <p>
            Añade esta configuración en un cliente que admita servidores MCP
            locales. Mantén Jubhunter's Hoard abierto mientras trabaja tu asistente.
          </p>
          {error && <p role="alert">{error}</p>}
          {connection ? (
            <>
              <div className="connection-status">
                <span className="status-dot" />
                <strong>
                  {connection.lastCallAt
                    ? "Conexión utilizada"
                    : "Listo para conectar"}
                </strong>
                <span>
                  {connection.lastCallAt
                    ? `Última consulta: ${new Date(connection.lastCallAt).toLocaleTimeString("es-ES")}`
                    : `${connection.toolCount} herramientas disponibles`}
                </span>
              </div>
              <pre className="code-block">
                {JSON.stringify(connection.config, null, 2)}
              </pre>
              <button
                className="btn-primary"
                onClick={() => copy(JSON.stringify(connection.config, null, 2))}
              >
                Copiar configuración
              </button>
            </>
          ) : (
            <p>Cargando configuración…</p>
          )}
        </section>
        <aside className="connection-note">
          <h3>Qué hace cada parte</h3>
          <p>
            <strong>Jubhunter's Hoard</strong> guarda la información, prepara el dossier y
            registra los resultados.
          </p>
          <p>
            <strong>Tu IA</strong> redacta y utiliza su navegador para leer
            ofertas y completar formularios.
          </p>
          <p>
            El asistente conectado usa su propio modelo. No necesitas configurar
            otra API para este flujo.
          </p>
          <p>
            La conexión es local y autenticada. Las claves de los proveedores no
            se exponen por MCP.
          </p>
        </aside>
      </div>
      <section className="starter-prompt">
        <div className="section-heading">
          <h2>Un punto de partida para tu asistente</h2>
          <button className="btn-ghost" onClick={() => copy(prompt)}>
            Copiar petición
          </button>
        </div>
        <p>{prompt}</p>
      </section>
    </div>
  );
}
