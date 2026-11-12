# Jobhunter's Hoard

A local workspace for job searching with an assistant: a reusable personal profile, separate search contexts, linked source documents, application preparation and an outcome log, available over MCP.

[Leer en español](README.es.md)

## What it is

Jobhunter's Hoard keeps the record of your job search on your computer. You describe yourself and what you are looking for once; an assistant of your choice (with its own model and browser) reads offers, prepares applications from your real documents and records what happened, through MCP tools. The app supplies the context and the application record; it never logs in to portals, solves CAPTCHAs, accepts agreements or clicks for itself. The interface is in Spanish.

## What it does

**Profile and contexts**
- **My context → Personal profile**: contact information, work history, availability and links, shared across searches.
- **What I am looking for**: roles, locations, work mode, salary goals, excluded companies and priorities.
- **Instructions**: how offers should be assessed and applications written. Separate contexts keep different searches apart; each application keeps its original context.
- **Sources**: link folders, files and web references or add notes. PDF with text, DOCX, Markdown, text, CSV/TSV and supported code files are read from their current version; hidden files, dependency folders and common credential names are excluded. Linked websites are references: saving one does not fetch it or sign in. Scanned PDFs go through Kafka's document reader when it is reachable, with the local reader as fallback.
- **View** a source to read its extracted text fragment by fragment, and **Search linked sources** to search the current text of enabled sources (up to 60 files and their first 20,000 characters, with provenance and coverage; no AI, no downloads).
- **Answers**: verified responses to recurring questions; unknown answers stay pending. The library keeps scope (profile or application), provenance, original offer and date, groups variants of a question, can filter pending ones and recover answers from drafts. See [docs/ANSWER-LIBRARY.md](docs/ANSWER-LIBRARY.md).
- **Cartas**: cover-letter templates per context with Spanish/English text and `{{puesto}}` and `{{empresa}}` variables, a preview and copy of the prepared letter.

**Applications**
- A list with search, exact **Estado** and **Modalidad** filters, sorting, status changes per row or in bulk, and **Compare offers** side by side (location, work mode, salary, status, fit score, follow-up dates and notes, copyable as text; no new score or currency conversion).
- Each offer has editable data (including real submission date and a **Saved salary range**: minimum, maximum, currency and period, with unknowns kept unknown), notes, draft documents (CV, letter, answers, references, missing data), attempts and an **Actividad** history.
- **Registrar respuesta recibida**: record an employer message by hand (acknowledgment, information request, rejection, interview, offer) with evidence, date/time, optional interview date and message reference. Repeating a reference never duplicates it; an acknowledgment never changes the status. Nothing is sent or looked up.
- **Seguimiento** (follow-up): schedule the next review for sent, answered or interviewing applications, draft a follow-up message (never sent), and **Llevar estas fechas al calendario** to preview and download an ICS of interview or review dates (offset timestamps as UTC, zone-less times as floating, date-only as all-day; nothing inferred, nothing synchronised).
- **Resultados**: rejections, interview and offer milestones, comparison by status, work mode, eight-week activity and source. Undated submissions count in totals but not in weekly activity.
- **Buscar ofertas**: a search view for finding offers.
- **Review before sending** or **advance automatically** modes. Automatic checks cover work mode, relocation, comparable annual salary minimum, excluded companies, basic data, draft and a daily limit; free-text criteria need the assistant's judgement. A pending or uncertain attempt blocks another submission, even after a restart. A confirmation is evidence declared by the assistant, not independent verification of the portal.

**Import and export**
- **Importar hoja**: paste a Google Sheet range or load CSV/TSV (link, company, role, type, status, location, notes, date). A preview shows duplicates and unrecognised states; missing historical dates stay unknown. Up to 2,000 rows per import; no continuous sync.
- CSV export (with work mode and context; formulas from imported text are neutralised) and a JSON backup with the full record, settings, profile and contexts, excluding linked source files and the MCP credential.

## How to run it

Requires Node.js 22.13 or newer. On Windows open **Iniciar Jubhunter's Hoard.cmd**, or run:

```sh
npm install
npm run build
npm start
```

The app starts at `http://127.0.0.1:5178` or the next free port and reports the chosen address. `npm run dev` coordinates a Vite port and an API proxy for development; `node scripts/ui-fixture.mjs` opens an isolated demo instance with fictitious data. Optional variables: `PORT`, `JOBHUNT_DATA_DIR`; for the MCP adapter, `JOBHUNT_URL` (must be local), `JOBHUNT_TOKEN_FILE` or `JOBHUNT_TOKEN`.

**Data.** `data/db.json` (applications, contexts, answers, settings; atomic writes; an unreadable database stops startup rather than being replaced), `data/profile.md` and `data/mcp-token` (created at startup, excluded from backups). Data is stored locally without app-level encryption. An external AI provider receives the dossier when the app's internal buttons are used; an external assistant receives only what it queries through MCP. `GET /api/health` answers `{service, version, dataDirConfigured, hoard_link}` without personal data.

**Limits.** Reading: 8 MB per file and 80 pages per PDF; paginated answers of up to 20,000 characters; the dossier carries direct-source fragments within a 20,000-character budget and folders are read on demand. The daily attempt limit is counted per context and UTC date. Changing personal data, instructions, sources or conditions invalidates pending approvals.

## Connecting an assistant

In **Conectar IA**, copy the MCP stdio settings into a compatible local client and keep the app open while using it. The client brings the model and browser; no second AI key is needed for MCP (the internal analysis, generation, interview and follow-up buttons use the optional provider in **Ajustes**). The stdio adapter forwards calls to the authenticated localhost server, and only that server writes the database, so several assistants never keep conflicting copies. The server listens only on `127.0.0.1` and rejects requests from other websites. A web chat cannot gain access by pasting an address or a prompt.

Tools:

| Tool | Use |
| --- | --- |
| `list_contexts`, `get_context` | choose a search and get instructions, profile, preferences and references |
| `list_sources`, `list_source_files`, `read_source`, `search_context` | discover, read and search linked evidence |
| `list_jobs`, `get_application`, `compare_jobs` | list applications (paginated), get a dossier with pending conditions, compare offers |
| `capture_job`, `update_job_facts` | register an offer read in the browser (URLs deduplicated) and save verified conditions, salary, description, notes and next action |
| `remember_answer` | save a question and its answer (or leave it pending) without overwriting variants |
| `save_application_draft`, `start_application`, `record_application_result` | save documents, reserve an attempt after checking conditions, review and daily limit, and record a visible confirmation, block or uncertain result |
| `record_employer_response` | record an employer message by id, idempotently |
| `export_job_calendar` | ICS of interview or review dates for the given applications |

Tools do not expose provider keys and cannot change permanent instructions, preferences or sources; documents and offers are labelled as reference data, separate from the user's instructions. The catalogue is also at `GET /api/agent/tools` and `docs/API.md`.

## Connection with Faustus and the Hub

The app follows the family contract: `faustus-plugin.json`, `GET /api/agent/tools`, `POST /api/agent/call` with `Authorization: Bearer <data/mcp-token>` and `{name, arguments, caller}`, and an `agent.call` event per call on the hub bus (`HOARD_EVENTS=0` silences it, `HOARD_HUB_URL` changes the hub). The MCP bridge also serves the local skill shelf (`skills_list`, `skill_read`, `skill-<slug>` prompts, including when the library is offline); the manifest names `job-application-tracking` and `pretask-interview`. The vendored family library is synchronised from the Hub.

**Faustus copilot.** Every page has a floating **Faustus** button that opens the assistant in a side panel. Conversation, model, memory and tools live in Faustus; this app only relays the panel and keeps no history. Without Faustus the button explains that the copilot is unavailable. Relay routes: `GET /api/copilot/info`, `/api/copilot/panel.js`, `/api/copilot/launcher.js` and `POST /api/copilot/proxy` (only the copilot's own routes; the Faustus token never reaches the browser). Each turn tells the assistant the search in use (each search has its own conversation), the page and tab, list filters and ticked rows, the open job and its search, and the fields typed in open forms and which changed (provider keys are never sent). When the assistant finishes a turn the open views reload in place and saving sends only the fields you changed. Job dialogs open beside the page so the button stays usable. `HOARD_FAUSTUS_URL` (default `http://127.0.0.1:7000`) sets the address and `HOARD_COPILOT=0` turns it off. The client is in `client/src/copilot-context.js` and `client/src/copilot-hooks.js`.

## Project layout

| Path | Contents |
|---|---|
| `server/` | Express server, store, applications, sources and ingestion, answer library, calendar, comparison, MCP tools |
| `server/hoard-link.js`, `server/hoard-commons/` | vendored family library |
| `client/` | React interface |
| `scripts/` | launcher, dev runner, UI fixture |
| `docs/` | `API.md`, `ANSWER-LIBRARY.md` |
| `tests/` | test suite |
| `data/` | local data (not tracked) |

Product and design decisions are in `PRODUCT.md` and `DESIGN.md`.

## Tests

```sh
npm test
npm run build
npm audit
```

Tests use temporary directories and an isolated UI fixture.
