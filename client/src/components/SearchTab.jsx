import { useState } from 'react';
import { api, daysAgo } from '../api.js';

export default function SearchTab({ settings, sources, addJobs, notify, saveSearches }) {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [chosen, setChosen] = useState(() => new Set(sources.filter((s) => !s.needsKey || settings.adzunaAppId).map((s) => s.id)));
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);

  const savedSearches = settings.savedSearches || [];

  const runSearch = async (q, loc, srcs) => {
    setLoading(true);
    setResults([]); setErrors([]); setSelected(new Set());
    try {
      const out = await api.search({ query: q, location: loc, sources: srcs });
      setResults(out.results);
      setErrors(out.errors || []);
      if (!out.results.length) notify('Sin resultados. Prueba términos más genéricos o en inglés.', 'info');
    } catch (e2) {
      notify(e2.message);
    } finally {
      setLoading(false);
    }
  };

  const applySaved = (s) => {
    setQuery(s.query);
    setLocation(s.location || '');
    setChosen(new Set(s.sources || []));
    runSearch(s.query, s.location || '', s.sources || []);
  };

  const saveCurrent = () => {
    const name = window.prompt('Nombre para esta búsqueda:', query.slice(0, 30));
    if (!name) return;
    saveSearches([...savedSearches, { name, query, location, sources: [...chosen] }]).catch((e) => notify(e.message));
  };

  const deleteSaved = (i) => {
    saveSearches(savedSearches.filter((_, idx) => idx !== i)).catch((e) => notify(e.message));
  };

  const toggleSource = (id) => {
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doSearch = (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    runSearch(query, location, [...chosen]);
  };

  const toggleSel = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const importItems = async (items) => {
    setImporting(true);
    try {
      const out = await api.importJobs(items);
      addJobs(out.jobs);
      notify(`Importadas ${out.added} ofertas${out.skipped ? ` (${out.skipped} ya estaban)` : ''}`, 'info');
      setResults((rs) => rs.map((r) => (items.includes(r) ? { ...r, alreadyTracked: true } : r)));
      setSelected(new Set());
    } catch (e) {
      notify(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <form onSubmit={doSearch} className="mx-auto max-w-5xl">
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-64"
            placeholder="Qué buscas: software engineer, machine learning, C++…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <input
            className="input w-56"
            placeholder="Ubicación (para Adzuna): Madrid…"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button className="btn-primary" disabled={loading || !query.trim()}>
            {loading ? 'Buscando…' : ' Buscar'}
          </button>
          <button type="button" className="btn-ghost" disabled={!query.trim()} onClick={saveCurrent} title="Guardar esta búsqueda">
            
          </button>
        </div>
        {savedSearches.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Guardadas:</span>
            {savedSearches.map((s, i) => (
              <span key={i} className="chip cursor-pointer bg-slate-800 text-slate-300 hover:bg-indigo-900" onClick={() => applySaved(s)}>
                 {s.name}
                <button
                  className="ml-1.5 text-slate-500 hover:text-rose-400"
                  onClick={(e) => { e.stopPropagation(); deleteSaved(i); }}
                  title="Borrar búsqueda guardada"
                >
                  
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((s) => {
            const disabled = s.needsKey && !settings.adzunaAppId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleSource(s.id)}
                title={disabled ? 'Necesita key gratuita — ver Ajustes' : ''}
                className={`chip transition-colors ${
                  disabled
                    ? 'bg-slate-900 text-slate-600'
                    : chosen.has(s.id)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </form>

      {errors.length > 0 && (
        <div className="mx-auto mt-3 max-w-5xl space-y-1">
          {errors.map((e) => (
            <div key={e.source} className="rounded-lg bg-amber-950/50 px-3 py-1.5 text-xs text-amber-300">
               {e.source}: {e.error}
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="mx-auto mt-4 max-w-5xl">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-sm text-slate-400">{results.length} resultados</span>
            {selected.size > 0 && (
              <button
                className="btn-primary text-xs"
                disabled={importing}
                onClick={() => importItems([...selected].map((i) => results[i]))}
              >
                {importing ? 'Importando…' : `⬇ Importar seleccionadas (${selected.size})`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                  r.alreadyTracked ? 'border-slate-800 bg-slate-900/40 opacity-60' : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1.5 accent-indigo-500"
                  disabled={r.alreadyTracked}
                  checked={selected.has(i)}
                  onChange={() => toggleSel(i)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-slate-100">{r.title}</span>
                    <span className="text-sm text-indigo-300">{r.company}</span>
                    {r.alreadyTracked && <span className="chip bg-slate-700 text-slate-300">ya en tracker</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                    <span> {r.location || '—'}</span>
                    {r.salary && <span> {r.salary}</span>}
                    <span className="text-slate-500">{r.source}</span>
                    {r.postedAt && daysAgo(r.postedAt) != null && <span>hace {daysAgo(r.postedAt)}d</span>}
                  </div>
                  {r.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.description}</p>}
                  {r.tags?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tags.slice(0, 8).map((t) => (
                        <span key={t} className="chip bg-slate-800 text-slate-400">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {!r.alreadyTracked && (
                    <button className="btn-ghost text-xs" disabled={importing} onClick={() => importItems([r])}>
                      ⬇ Importar
                    </button>
                  )}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener" className="btn-ghost text-xs">↗ Ver</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="mx-auto mt-16 max-w-md text-center text-sm text-slate-500">
          <p className="text-4xl"></p>
          <p className="mt-3">
            Busca en las fuentes gratuitas, o usa <b>＋ Pegar oferta</b> (arriba a la derecha) para meter cualquier
            oferta de LinkedIn/InfoJobs pegando su URL o su texto — el LLM la estructura solo.
          </p>
        </div>
      )}
    </div>
  );
}

