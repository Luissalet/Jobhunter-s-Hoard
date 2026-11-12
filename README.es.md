# Jobhunter's Hoard

Espacio de trabajo local para buscar empleo con un asistente: perfil personal reutilizable, contextos de búsqueda separados, documentos fuente enlazados, preparación de candidaturas y registro de resultados, disponible por MCP.

[Read in English](README.md)

## Qué es

Jobhunter's Hoard guarda en tu ordenador el registro de tu búsqueda de empleo. Te describes una vez a ti y lo que buscas; un asistente de tu elección (con su propio modelo y navegador) lee ofertas, prepara candidaturas a partir de tus documentos reales y registra lo ocurrido mediante herramientas MCP. La app aporta el contexto y el registro de candidaturas; nunca inicia sesión en portales, supera CAPTCHAs, acepta acuerdos ni hace clics por sí misma. La interfaz está en español.

## Qué hace

**Perfil y contextos**
- **Mi contexto → Perfil personal**: datos de contacto, trayectoria, disponibilidad y enlaces, comunes a todas las búsquedas.
- **Lo que busco**: puestos, ubicaciones, modalidad, objetivos salariales, empresas excluidas y prioridades.
- **Instrucciones**: cómo evaluar ofertas y redactar candidaturas. Los contextos separados mantienen distintas búsquedas aparte; cada candidatura conserva su contexto original.
- **Fuentes**: enlaza carpetas, archivos y referencias web o añade notas. Los PDF con texto, DOCX, Markdown, texto, CSV/TSV y archivos de código admitidos se leen en su versión actual; se excluyen archivos ocultos, carpetas de dependencias y nombres habituales de credenciales. Un enlace web es una referencia: guardarlo no descarga la página ni inicia sesión. Los PDF escaneados pasan por el lector de documentos de Kafka cuando está accesible, con el lector local como alternativa.
- **Ver** una fuente para leer su texto extraído fragmento a fragmento, y **Buscar en fuentes enlazadas** para buscar en el texto actual de las fuentes activas (hasta 60 archivos y sus primeros 20.000 caracteres, con procedencia y cobertura; sin IA ni descargas).
- **Respuestas**: respuestas verificadas a preguntas repetidas; lo desconocido queda pendiente. La biblioteca conserva el ámbito (perfil o candidatura), la procedencia, la oferta de origen y la fecha, agrupa las variantes de una pregunta, filtra las pendientes y recupera respuestas de borradores. Véase [docs/ANSWER-LIBRARY.md](docs/ANSWER-LIBRARY.md).
- **Cartas**: plantillas de carta por contexto con texto en español o inglés y las variables `{{puesto}}` y `{{empresa}}`, vista previa y copia de la carta preparada.

**Candidaturas**
- Lista con búsqueda, filtros exactos de **Estado** y **Modalidad**, ordenación, cambio de estado por fila o en bloque, y **Comparar ofertas** lado a lado (ubicación, modalidad, salario, estado, puntuación de encaje, fechas de seguimiento y notas, copiable como texto; sin puntuación nueva ni conversión de moneda).
- Cada oferta tiene datos editables (incluida la fecha real de envío y un **rango salarial guardado**: mínimo, máximo, moneda y periodo, con lo desconocido como desconocido), notas, documentos de borrador (CV, carta, respuestas, referencias, datos que faltan), intentos y un historial en **Actividad**.
- **Registrar respuesta recibida**: guarda a mano un mensaje de la empresa (acuse, petición de información, rechazo, entrevista, oferta) con su evidencia, fecha/hora, fecha de entrevista opcional y referencia del mensaje. Repetir una referencia nunca duplica; un acuse nunca cambia el estado. No se envía ni se consulta nada.
- **Seguimiento**: programa la próxima revisión de candidaturas enviadas, con respuesta o en entrevista, redacta un mensaje de seguimiento (nunca se envía) y **Llevar estas fechas al calendario** para previsualizar y descargar un ICS con las fechas de entrevista o revisión (marcas con desfase en UTC, horas sin zona como flotantes, fechas sin hora como todo el día; no se infiere nada ni se sincroniza).
- **Resultados**: rechazos, hitos de entrevista y oferta, comparación por estado, modalidad, actividad de ocho semanas y fuente. Los envíos sin fecha cuentan en los totales pero no en la actividad semanal.
- **Buscar ofertas**: vista de búsqueda para encontrar ofertas.
- Modos **Revisar antes de enviar** y **Avanzar automáticamente**. Los controles automáticos comprueban modalidad, traslado, mínimo salarial anual comparable, empresas excluidas, datos básicos, borrador y límite diario; los criterios de texto libre requieren el juicio del asistente. Un intento en curso o incierto bloquea otro envío, incluso tras reiniciar. Una confirmación es evidencia declarada por el asistente, no una verificación independiente del portal.

**Importar y exportar**
- **Importar hoja**: pega un rango de Google Sheets o carga CSV/TSV (enlace, empresa, puesto, tipo, estado, ubicación, notas, fecha). La vista previa muestra duplicados y estados no reconocidos; las fechas históricas ausentes quedan desconocidas. Hasta 2.000 filas por importación; sin sincronización continua.
- Exportación CSV (con modalidad y contexto; se neutralizan las fórmulas del texto importado) y copia JSON con el registro completo, ajustes, perfil y contextos, sin los archivos fuente enlazados ni la credencial MCP.

## Cómo arrancarlo

Necesita Node.js 22.13 o posterior. En Windows abre **Iniciar Jubhunter's Hoard.cmd**, o ejecuta:

```sh
npm install
npm run build
npm start
```

La aplicación arranca en `http://127.0.0.1:5178` o en el siguiente puerto libre y muestra la dirección elegida. `npm run dev` coordina un puerto de Vite y un proxy de API para desarrollo; `node scripts/ui-fixture.mjs` abre una instancia de demostración aislada con datos ficticios. Variables opcionales: `PORT`, `JOBHUNT_DATA_DIR`; para el adaptador MCP, `JOBHUNT_URL` (debe ser local), `JOBHUNT_TOKEN_FILE` o `JOBHUNT_TOKEN`.

**Datos.** `data/db.json` (candidaturas, contextos, respuestas, ajustes; escritura atómica; una base ilegible detiene el arranque en lugar de reemplazarse), `data/profile.md` y `data/mcp-token` (creado al iniciar, excluido de las copias). Los datos se guardan en local sin cifrado propio. Un proveedor de IA externo recibe el dossier cuando usas los botones internos; un asistente externo recibe solo lo que consulta por MCP. `GET /api/health` responde `{service, version, dataDirConfigured, hoard_link}` sin datos personales.

**Límites.** Lectura: 8 MB por archivo y 80 páginas por PDF; respuestas paginadas de hasta 20.000 caracteres; el dossier incluye fragmentos de fuentes directas con un presupuesto de 20.000 caracteres y las carpetas se leen bajo demanda. El límite de intentos diarios se cuenta por contexto y fecha UTC. Cambiar datos personales, instrucciones, fuentes o condiciones invalida las aprobaciones pendientes.

## Conectar un asistente

En **Conectar IA**, copia la configuración MCP por stdio en un cliente local compatible y mantén la app abierta mientras la uses. El cliente aporta el modelo y el navegador; no hace falta una segunda clave de IA para MCP (los botones internos de análisis, generación, entrevista y seguimiento usan el proveedor opcional de **Ajustes**). El adaptador stdio reenvía las llamadas al servidor local autenticado, y solo ese servidor escribe la base de datos, de modo que varios asistentes nunca mantienen copias en conflicto. El servidor escucha solo en `127.0.0.1` y rechaza peticiones de otras webs. Un chat web no puede obtener acceso pegando una dirección o un prompt.

Herramientas:

| Herramienta | Uso |
| --- | --- |
| `list_contexts`, `get_context` | elegir una búsqueda y obtener instrucciones, perfil, preferencias y referencias |
| `list_sources`, `list_source_files`, `read_source`, `search_context` | descubrir, leer y buscar evidencias enlazadas |
| `list_jobs`, `get_application`, `compare_jobs` | listar candidaturas (paginado), obtener un dossier con condiciones pendientes, comparar ofertas |
| `capture_job`, `update_job_facts` | registrar una oferta leída en el navegador (URL deduplicadas) y guardar condiciones verificadas, salario, descripción, notas y próxima acción |
| `remember_answer` | guardar una pregunta y su respuesta (o dejarla pendiente) sin sobrescribir variantes |
| `save_application_draft`, `start_application`, `record_application_result` | guardar documentos, reservar un intento tras comprobar condiciones, revisión y límite diario, y registrar una confirmación visible, un bloqueo o un resultado incierto |
| `record_employer_response` | registrar un mensaje de la empresa por su id, de forma idempotente |
| `export_job_calendar` | ICS con las fechas de entrevista o revisión de las candidaturas indicadas |

Las herramientas no exponen claves de proveedores ni permiten cambiar instrucciones, preferencias o fuentes permanentes; los documentos y las ofertas se identifican como datos de referencia, separados de las instrucciones del usuario. El catálogo también está en `GET /api/agent/tools` y en `docs/API.md`.

## Conexión con Faustus y el Hub

La app sigue el contrato de la familia: `faustus-plugin.json`, `GET /api/agent/tools`, `POST /api/agent/call` con `Authorization: Bearer <data/mcp-token>` y `{name, arguments, caller}`, y un evento `agent.call` por llamada en el bus del hub (`HOARD_EVENTS=0` lo silencia, `HOARD_HUB_URL` cambia el hub). El puente MCP sirve además la estantería local de skills (`skills_list`, `skill_read`, prompts `skill-<slug>`, también con la biblioteca desconectada); el manifiesto nombra `job-application-tracking` y `pretask-interview`. La biblioteca de la familia incluida se sincroniza desde el Hub.

**Copiloto de Faustus.** Todas las pantallas tienen un botón flotante de **Faustus** que abre el asistente en un panel lateral. La conversación, el modelo, la memoria y las herramientas viven en Faustus; esta app solo retransmite el panel y no guarda historial. Sin Faustus el botón avisa de que el copiloto no está disponible. Rutas de retransmisión: `GET /api/copilot/info`, `/api/copilot/panel.js`, `/api/copilot/launcher.js` y `POST /api/copilot/proxy` (solo las rutas propias del copiloto; el token de Faustus nunca llega al navegador). Cada turno informa al asistente de la búsqueda en uso (cada búsqueda tiene su propia conversación), la página y pestaña, los filtros de la lista y las filas marcadas, la candidatura abierta y su búsqueda, y los campos escritos en los formularios abiertos y cuáles cambiaron (las claves de los proveedores nunca se envían). Cuando el asistente termina un turno, las vistas abiertas se recargan en su sitio y al guardar solo se envían los campos que has cambiado. Los diálogos de candidatura se abren junto a la página para que el botón siga usable. `HOARD_FAUSTUS_URL` (por defecto `http://127.0.0.1:7000`) fija la dirección y `HOARD_COPILOT=0` lo desactiva. El cliente está en `client/src/copilot-context.js` y `client/src/copilot-hooks.js`.

## Estructura del proyecto

| Ruta | Contenido |
|---|---|
| `server/` | servidor Express, almacén, candidaturas, fuentes e ingesta, biblioteca de respuestas, calendario, comparación, herramientas MCP |
| `server/hoard-link.js`, `server/hoard-commons/` | biblioteca de la familia incluida |
| `client/` | interfaz React |
| `scripts/` | lanzador, ejecución de desarrollo, fixture de la interfaz |
| `docs/` | `API.md`, `ANSWER-LIBRARY.md` |
| `tests/` | batería de pruebas |
| `data/` | datos locales (no versionados) |

Las decisiones de producto y diseño están en `PRODUCT.md` y `DESIGN.md`.

## Pruebas

```sh
npm test
npm run build
npm audit
```

Las pruebas usan directorios temporales y un fixture de interfaz aislado.
