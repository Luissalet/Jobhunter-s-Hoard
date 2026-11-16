# API and assistant integration

The application serves its compiled client and native API from the same origin. `GET /api/health` reports service availability without personal data. The default port is 5178; `PORT` changes it. `JOBHUNT_DATA_DIR` selects the data folder. Stopping the application also stops its HTTP API; the stdio bridge still exposes its catalogue but domain calls require the running application.

## Native tools

`GET /api/agent/tools` returns the native catalogue and instructions. `POST /api/agent/call` accepts `{name, arguments, caller}` with `Authorization: Bearer <data/mcp-token>`. The stdio entry point is `node server/mcp.js`, configured with `JOBHUNT_URL` and `JOBHUNT_TOKEN_FILE` or `JOBHUNT_TOKEN`.

The 20 tools are `export_job_calendar`, `compare_jobs`, `score_job_fit`, `get_job_fit`, `rank_jobs_by_fit`, `remember_answer`, `list_contexts`, `get_context`, `list_sources`, `list_source_files`, `read_source`, `search_context`, `list_jobs`, `capture_job`, `update_job_facts`, `get_application`, `save_application_draft`, `start_application`, `record_application_result` and `record_employer_response`. Their current schemas are available from the native catalogue. Saving a draft does not send an application; recording a submitted result requires observed confirmation.

`score_job_fit {jobId, analysis}` stores a requirement-by-requirement fit. Each criterion carries `requirement`, `importance` (`critical|high|meaningful|preferred|low_signal`), `evidence` (`stated|structural|inferred`), `jdSignal`, `match` (`strong|partial|missing|na`), `cvEvidence`, `gap`, `risk` and `mitigation`. The app computes the score as the weighted mean of the matches (strong 1, partial 0.5, missing 0, `na` excluded), so the model never supplies the number. Two gates apply before scoring: a `stated` weight without its quote becomes `structural`, and an `inferred` weight can never be `critical` or `high`. The stored `fit` holds the score, the decision band (80+ apply, 60-79 doubtful, below 60 skip), the criteria with their weight and value, the blocking gaps (missing or partial at critical/high), the plan derived from the score and the corrected weights. `score` and `scoreDetails` are kept in step for the existing views. `get_job_fit {jobId}` reads it back and `rank_jobs_by_fit {contextId?, limit?}` orders the offers that have one. `POST /api/jobs/:id/fit` runs the configured provider with the fit prompt and stores the result; `GET /api/jobs/:id/fit` and `POST /api/jobs/fit/rank` serve the two read tools. Nothing is sent and no application state changes.

`export_job_calendar {jobIds, kind}` (`kind: interview|review`) and `POST /api/jobs/calendar` share a read-only handler. Each distinct requested ID contributes its current `interviewAt` or `nextActionAt`; absent/invalid dates or missing jobs are returned in `skipped` with a reason. `events`, `generatedAt` and `ics` form one snapshot for preview/download. The UI submits only the IDs in its current Follow-up list. The API does not discover or add other candidates. Offset/Z values become UTC, no-zone times remain floating, and date-only values are all-day. UID is stable per job/type, with UTF-8 folding/escaping/CRLF per [RFC5545](https://www.rfc-editor.org/rfc/rfc5545.html). No duration, alarm, attendees, calendar invitation or remote synchronization is created; original fractional seconds remain in `original`, while ICS uses whole seconds. No job or setting is written.

Calendar export uses the agent router's documented uncapped-result path so a large ICS and its events remain complete. This export's wrapper marks only its own result; the internal marker is not serialized in UI/API/MCP responses. Other tool response limits remain unchanged.

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
