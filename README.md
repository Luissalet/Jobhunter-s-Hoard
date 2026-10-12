# Jobhunter's Hoard

[Español](README.es.md)

A local workspace for job searching with an assistant: reusable personal profile, separate search contexts, linked source documents, application preparation and an outcome log available over MCP.

## Open

Requires Node.js 22.13 or newer. On Windows, open **Iniciar Jubhunter's Hoard.cmd**, or run:

```sh
npm install
npm run build
npm start
```

The app starts at `http://127.0.0.1:5178` or the next free port and reports the chosen address. The Windows launcher opens that address. `npm run dev` coordinates a Vite port and API proxy for development.

## Set up your workspace

1. In **My context → Personal profile**, review contact information, work history, availability and links. These are shared across searches.
2. In **What I am looking for**, set roles, locations, work mode, salary goals, excluded companies and priorities.
3. In **Instructions**, define how offers should be assessed and how applications should be written. Separate contexts keep different searches apart; each application keeps its original context.
4. In **Sources**, link folders, files and web references or add notes. PDF with text, DOCX, Markdown, text, CSV/TSV and supported code files are read from their current version. Linked websites are references; saving one does not fetch it or sign in. Scanned PDFs need external OCR.
5. In **Answers**, save verified responses to recurring questions. Unknown answers remain pending. The library keeps provenance, scope, original offer and date. See [the answer library](docs/ANSWER-LIBRARY.md).

## Connect an assistant

**Connect AI** provides MCP stdio settings for a compatible local client. Keep Jubhunter's Hoard open while using it. The client supplies its own model and browser; the app supplies context and the application record. No second AI key is needed for MCP. Internal analysis and generation buttons can use a provider configured in **Settings**.

The stdio adapter forwards calls to the authenticated localhost server. Only that server writes the database, so multiple assistants do not keep conflicting copies. Tools cover contexts and sources, reading and searching evidence, listing and capturing offers, recording verified facts, preparing applications, employer responses and saved answers. A web chat cannot gain access by pasting an address or prompt.

## Import, export and data

Paste a Google Sheet range or import CSV/TSV with columns such as link, company, role, status, location, notes and date. Preview detects duplicates and unknown states before import; missing historical dates remain unknown. The limit is 2,000 rows per import, with no continuous Google Sheets sync. CSV export includes work mode and context; JSON backup includes the full record, settings, profile and contexts but excludes linked source files and the MCP credential.

Local files under `data/` include `db.json`, `profile.md` and `mcp-token`. The token is generated on startup and is excluded from backups. Data is stored locally without app-level encryption. An external AI provider receives the dossier when its internal buttons are used; an external assistant receives only the data it queries through MCP. The health endpoint exposes service status without personal data.

## Faustus copilot

Every page has a floating **Faustus** button (bottom right) that opens the Faustus assistant in a side panel. The conversation, model, memory and tools live in Faustus: this app only relays the panel and keeps no history. It needs Faustus running (`HOARD_FAUSTUS_URL`, default `http://127.0.0.1:7000`); without it the button explains that the copilot is unavailable and the rest of the app is unaffected. The relay is mounted when the built client is served (`npm run build`, then `npm start`).

| Route | What it does |
| --- | --- |
| `GET /api/copilot/info` | App id and name, data space and where the panel script is. |
| `GET /api/copilot/panel.js` | The Faustus panel, relayed from Faustus (same origin). |
| `GET /api/copilot/launcher.js` | The button that mounts the panel; the served page carries its tag. |
| `POST /api/copilot/proxy` | Relays only the copilot's own Faustus routes; the Faustus token never reaches the browser. |

What every turn tells the assistant (`window.hoardCopilot.context()`, read through the app's own API):

- `project`: the search (context) in use; each search has its own conversation. Switching searches switches the conversation.
- `view.page` (`applications`, `agenda`, `search`, `context`, `connection`, `stats`, `settings`) and, with a job open, `view.job_id` and `view.detail_tab`; the list filters, the rows ticked, the agenda list, the search query, the section of Mi contexto.
- `active_objects`: the open job (status, fit, dates, notes, draft state, attempts and employer responses), its search (instructions, sources, preferences), the ticked jobs and the answer being edited. Creation forms, an unknown job id and `new` add no object and never fail.
- `view.editor`: the fields typed in the open form and which of them changed (offer data, notes, draft, new job, pasted sheet, search query, the context's profile, preferences and instructions, a new or edited answer, a new source, the settings). The keys of the AI providers are never sent. Several open forms are listed in `view.editors`.

When the assistant finishes a turn the open views reload in place; forms keep what you typed and the fields you did not touch follow the new values. Saving sends **only the fields you changed**: job data and notes (the backend merges), settings, personal data and profile, and, because the server replaces whole contexts and drafts, the context and the draft are laid over the copy the server has at that moment.

The job and new-job dialogs open beside the page instead of as modal dialogs so the Faustus button stays usable while they are open. Turn the copilot off with `HOARD_COPILOT=0`. The client is in `client/src/copilot-context.js` and `client/src/copilot-hooks.js`.

## Verify

```sh
npm test
npm run build
npm audit
```

Tests use temporary directories and an isolated UI fixture. Product and design decisions are in `PRODUCT.md` and `DESIGN.md`.


## Shared services (HoardLink 0.8.1)

Scanned source PDFs use Kafka through the family document client; the existing local reader remains available when the owner cannot be reached.

The vendored copy is maintained by HoardLink’s sync script. Windows validation and the family service contract are documented in HoardLink’s `docs/commons/windows-validation.md` and `docs/commons/services.md`.
