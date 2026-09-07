import { useState } from 'react';
import { api } from '../api.js';

export default function IngestModal({ close, onCreated, notify }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setLoading(true);
    try {
      const isUrl = /^https?:\/\/\S+$/.test(v);
      const job = await api.ingest(isUrl ? { url: v } : { text: v });
      notify(`Añadida: ${job.title} · ${job.company}`, 'info');
      onCreated(job);
    } catch (e) {
      notify(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">＋ Pegar oferta</h2>
        <p className="mt-1 text-sm text-slate-400">
          Pega la <b>URL</b> de la oferta o directamente su <b>texto completo</b> (LinkedIn, InfoJobs, email…).
          El LLM extrae título, empresa, requisitos y demás. Si la web bloquea la descarga, pega el texto.
        </p>
        <textarea
          className="input mt-3 h-48 resize-y font-mono text-xs"
          placeholder={'https://...\n\no el texto de la oferta'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={close}>Cancelar</button>
          <button className="btn-primary" disabled={loading || !value.trim()} onClick={submit}>
            {loading ? '🤖 Extrayendo con LLM…' : 'Añadir al tracker'}
          </button>
        </div>
      </div>
    </div>
  );
}
