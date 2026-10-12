# API and assistant integration

The application serves its compiled client and native API from the same origin. `GET /api/health` reports service availability without personal data. The default port is 5178; `PORT` changes it. `JOBHUNT_DATA_DIR` selects the data folder. Stopping the application also stops its HTTP API; the stdio bridge still exposes its catalogue but domain calls require the running application.

## Native tools

`GET /api/agent/tools` returns the native catalogue and instructions. `POST /api/agent/call` accepts `{name, arguments, caller}` with `Authorization: Bearer <data/mcp-token>`. The stdio entry point is `node server/mcp.js`, configured with `JOBHUNT_URL` and `JOBHUNT_TOKEN_FILE` or `JOBHUNT_TOKEN`.

The 15 tools are `remember_answer`, `list_contexts`, `get_context`, `list_sources`, `list_source_files`, `read_source`, `search_context`, `list_jobs`, `capture_job`, `update_job_facts`, `get_application`, `save_application_draft`, `start_application`, `record_application_result` and `record_employer_response`. Their current schemas are available from the native catalogue. Saving a draft does not send an application; recording a submitted result requires observed confirmation.

## Shared Faustus assistant

The compiled client mounts the common HoardLink relay and launcher:

| Route | Purpose |
| --- | --- |
| `GET /api/copilot/info` | Resolve the configured Faustus service and stable origin. |
| `GET /api/copilot/panel.js` | Serve the shared assistant component. |
| `GET /api/copilot/launcher.js` | Serve the common Faustus icon and launcher. |
| `POST /api/copilot/proxy` | Relay assistant requests and streaming responses. |

Faustus owns conversations, drafts and model turns. The backend keeps its credentials; they are not included in the browser context. `HOARD_FAUSTUS_URL` selects Faustus (default `http://127.0.0.1:7000`); `HOARD_COPILOT=0` disables the launcher. If Faustus is unavailable, the native application remains usable.

`window.hoardCopilot.context()` reads the current native state. `project` identifies the active search; `active_objects` identifies real jobs, contexts and answers. The view includes selection, filters, open detail and pending editor fields. Creation forms and missing or `new` identifiers produce no corresponding object. Stored descriptions and notes use concise previews; pending context fields may also use display limits. Provider keys are represented as changed or cleared rather than copied into context.

`onTurnEnd()` and `hoard:copilot-turn-end` refresh mounted views without replacing the open forms. Job, notes, settings, personal-data and profile saves send changed fields. Context and application-draft saves read the current server value and overlay the edited fields; this client-side merge retains the small concurrency window documented in the approved review. This is not a server-side compare-and-swap operation.

See [README.es.md](../README.es.md) for the Spanish user workflow and [README.md](../README.md) for installation.
