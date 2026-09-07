import { useMemo } from 'react';

const APPLIED_SET = ['applied', 'answered', 'interview', 'offer', 'rejected'];
const RESPONDED_SET = ['answered', 'interview', 'offer'];

function weekKey(iso) {
  const d = new Date(iso);
  // lunes de esa semana
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function Funnel({ steps }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-right text-xs text-slate-400">{s.label}</span>
          <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-800/50">
            <div
              className="flex h-full items-center rounded-md bg-indigo-600 px-2 text-xs font-bold text-white transition-all"
              style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value > 0 ? '2rem' : 0, opacity: 1 - i * 0.09 }}
            >
              {s.value > 0 && s.value}
            </div>
          </div>
          {s.rate != null && <span className="w-12 text-xs text-slate-500">{s.rate}%</span>}
        </div>
      ))}
    </div>
  );
}

function WeeklyChart({ jobs, weeklyGoal }) {
  const weeks = useMemo(() => {
    const map = new Map();
    // últimas 8 semanas
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 86400000);
      map.set(weekKey(d.toISOString()), 0);
    }
    for (const j of jobs) {
      if (!j.appliedAt) continue;
      const k = weekKey(j.appliedAt);
      if (map.has(k)) map.set(k, map.get(k) + 1);
    }
    return [...map.entries()];
  }, [jobs]);

  const max = Math.max(...weeks.map(([, v]) => v), weeklyGoal || 1, 1);
  const W = 560, H = 160, PAD = 24;
  const bw = (W - PAD * 2) / weeks.length;

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full">
      {weeklyGoal > 0 && (
        <>
          <line
            x1={PAD} x2={W - PAD}
            y1={H - (weeklyGoal / max) * (H - 20)} y2={H - (weeklyGoal / max) * (H - 20)}
            stroke="#f59e0b" strokeDasharray="4 4" strokeWidth="1"
          />
          <text x={W - PAD} y={H - (weeklyGoal / max) * (H - 20) - 4} fill="#f59e0b" fontSize="10" textAnchor="end">
            objetivo {weeklyGoal}
          </text>
        </>
      )}
      {weeks.map(([k, v], i) => {
        const h = (v / max) * (H - 20);
        const x = PAD + i * bw + bw * 0.15;
        return (
          <g key={k}>
            <rect x={x} y={H - h} width={bw * 0.7} height={Math.max(h, 1)} rx="4"
              fill={v >= (weeklyGoal || Infinity) ? '#10b981' : '#6366f1'} />
            {v > 0 && (
              <text x={x + bw * 0.35} y={H - h - 5} fill="#cbd5e1" fontSize="11" textAnchor="middle" fontWeight="bold">{v}</text>
            )}
            <text x={x + bw * 0.35} y={H + 16} fill="#64748b" fontSize="9" textAnchor="middle">
              {new Date(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function StatsTab({ jobs, settings }) {
  const stats = useMemo(() => {
    const applied = jobs.filter((j) => APPLIED_SET.includes(j.status) || j.appliedAt);
    const responded = jobs.filter((j) => RESPONDED_SET.includes(j.status));
    const interviews = jobs.filter((j) => ['interview', 'offer'].includes(j.status));
    const offers = jobs.filter((j) => j.status === 'offer');

    // tiempo medio hasta respuesta (applied → answered/interview en history)
    const times = [];
    for (const j of jobs) {
      const a = j.history?.find((h) => h.status === 'applied');
      const r = j.history?.find((h) => RESPONDED_SET.includes(h.status));
      if (a && r) times.push((new Date(r.at) - new Date(a.at)) / 86400000);
    }
    const avgResponse = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;

    // por fuente
    const bySource = {};
    for (const j of jobs) {
      const s = (bySource[j.source] ||= { total: 0, applied: 0, responded: 0 });
      s.total++;
      if (APPLIED_SET.includes(j.status) || j.appliedAt) s.applied++;
      if (RESPONDED_SET.includes(j.status)) s.responded++;
    }

    return { applied, responded, interviews, offers, avgResponse, bySource };
  }, [jobs]);

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 font-bold">Funnel</h2>
          <Funnel
            steps={[
              { label: 'En el tracker', value: jobs.length },
              { label: 'Aplicadas', value: stats.applied.length, rate: pct(stats.applied.length, jobs.length) },
              { label: 'Respuesta', value: stats.responded.length, rate: pct(stats.responded.length, stats.applied.length) },
              { label: 'Entrevista', value: stats.interviews.length, rate: pct(stats.interviews.length, stats.applied.length) },
              { label: 'Oferta', value: stats.offers.length, rate: pct(stats.offers.length, stats.applied.length) },
            ]}
          />
          {stats.avgResponse != null && (
            <p className="mt-3 text-xs text-slate-400">⏱ Tiempo medio hasta primera respuesta: <b>{stats.avgResponse} días</b></p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-1 font-bold">Aplicaciones por semana</h2>
          <WeeklyChart jobs={jobs} weeklyGoal={settings.weeklyGoal} />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 font-bold">Por fuente</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1">Fuente</th>
                <th className="pb-1 text-right">Importadas</th>
                <th className="pb-1 text-right">Aplicadas</th>
                <th className="pb-1 text-right">Respuestas</th>
                <th className="pb-1 text-right">Tasa</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.bySource)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([source, s]) => (
                  <tr key={source} className="border-t border-slate-800">
                    <td className="py-1.5">{source}</td>
                    <td className="py-1.5 text-right">{s.total}</td>
                    <td className="py-1.5 text-right">{s.applied}</td>
                    <td className="py-1.5 text-right">{s.responded}</td>
                    <td className="py-1.5 text-right text-slate-400">{s.applied ? Math.round((s.responded / s.applied) * 100) + '%' : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            La tasa de respuesta por fuente te dice dónde merece la pena invertir el tiempo.
          </p>
        </section>
      </div>
    </div>
  );
}

