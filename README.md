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

## Verify

```sh
npm test
npm run build
npm audit
```

Tests use temporary directories and an isolated UI fixture. Product and design decisions are in `PRODUCT.md` and `DESIGN.md`.
