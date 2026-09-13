async function req(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    // Algunas rutas (p.ej. el conflicto 409 de /answers/:id) devuelven más
    // que un mensaje; el body completo queda disponible para quien lo
    // necesite sin romper a quien solo lee err.message.
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  workspace: (url, method = 'GET', body) => req(url, { method, body }),
  state: () => req('/api/state'),
  search: (body) => req('/api/search', { method: 'POST', body }),
  ingest: (body) => req('/api/ingest', { method: 'POST', body }),
  importJobs: (items) => req('/api/jobs/import', { method: 'POST', body: { items } }),
  addJob: (body) => req('/api/jobs', { method: 'POST', body }),
  patchJob: (id, body) => req(`/api/jobs/${id}`, { method: 'PATCH', body }),
  deleteJob: (id) => req(`/api/jobs/${id}`, { method: 'DELETE' }),
  score: (id) => req(`/api/jobs/${id}/score`, { method: 'POST', body: {} }),
  tailor: (id, lang) => req(`/api/jobs/${id}/tailor`, { method: 'POST', body: { lang } }),
  followup: (id, lang) => req(`/api/jobs/${id}/followup`, { method: 'POST', body: { lang } }),
  prep: (id, lang) => req(`/api/jobs/${id}/prep`, { method: 'POST', body: { lang } }),
  restore: (payload) => req('/api/restore', { method: 'POST', body: payload }),
  saveProfile: (markdown) => req('/api/profile', { method: 'PUT', body: { markdown } }),
  saveSettings: (settings) => req('/api/settings', { method: 'PUT', body: settings }),
};

export const STATUSES = [
  { id: 'inbox', label: 'Pendiente', color: 'bg-slate-600' },
  { id: 'interested', label: 'Me interesa', color: 'bg-sky-600' },
  { id: 'tailored', label: 'CV listo', color: 'bg-violet-600' },
  { id: 'applied', label: 'Enviada', color: 'bg-indigo-600' },
  { id: 'answered', label: 'En proceso', color: 'bg-amber-600' },
  { id: 'interview', label: 'Entrevista', color: 'bg-emerald-600' },
  { id: 'offer', label: 'Oferta', color: 'bg-green-500' },
  { id: 'rejected', label: 'Rechazada', color: 'bg-rose-800' },
  { id: 'discarded', label: 'Descartada', color: 'bg-slate-800' },
];

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;

export function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function scoreColor(score) {
  if (score == null) return 'bg-slate-700 text-slate-300';
  if (score >= 75) return 'bg-emerald-600 text-white';
  if (score >= 55) return 'bg-amber-600 text-white';
  return 'bg-rose-700 text-white';
}

