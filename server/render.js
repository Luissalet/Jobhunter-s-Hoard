// Render de CV y carta como HTML imprimible (A4). El usuario hace Ctrl+P → PDF. Coste cero.
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Inter', system-ui, sans-serif; color: #1a1a2e; margin: 0;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 18mm; background: white; }
  h1 { font-size: 22pt; margin: 0 0 2mm; color: #16213e; letter-spacing: -0.5px; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 1.5px; color: #4f46e5;
       border-bottom: 1.5px solid #4f46e5; padding-bottom: 1mm; margin: 6mm 0 2.5mm; }
  h3 { font-size: 10.5pt; margin: 3mm 0 1mm; }
  p, li { font-size: 9.5pt; line-height: 1.45; margin: 0 0 1.5mm; }
  ul { margin: 0 0 2mm; padding-left: 5mm; }
  a { color: #4f46e5; text-decoration: none; }
  strong { color: #16213e; }
  .contact { font-size: 9pt; color: #555; margin-bottom: 2mm; }
  @media print {
    body { background: white; }
    .page { padding: 12mm 15mm; }
    .no-print { display: none; }
  }
  @page { size: A4; margin: 0; }
  .toolbar { position: sticky; top: 0; background: #16213e; color: white; padding: 10px 16px;
             display: flex; gap: 12px; align-items: center; font-size: 14px; }
  .toolbar button { background: #4f46e5; color: white; border: 0; padding: 8px 18px; border-radius: 6px;
                    cursor: pointer; font-size: 14px; }
`;

export function renderDocPage({ title, markdown, subtitle }) {
  const body = sanitizeHtml(marked.parse(markdown || '_Sin contenido_'));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="toolbar no-print">
    <span>${esc(title)}${subtitle ? ' · ' + esc(subtitle) : ''}</span>
    <button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
    <button onclick="navigator.clipboard.writeText(document.getElementById('md').textContent).then(()=>this.textContent='✓ Copiado')">📋 Copiar markdown</button>
  </div>
  <div class="page">${body}</div>
  <pre id="md" style="display:none">${esc(markdown || '')}</pre>
</body>
</html>`;
}
