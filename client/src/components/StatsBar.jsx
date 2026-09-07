import { daysAgo } from '../api.js';

export default function StatsBar({ jobs, settings }) {
  const applied = jobs.filter((j) => ['applied', 'answered', 'interview', 'offer', 'rejected'].includes(j.status));
  const appliedWeek = applied.filter((j) => daysAgo(j.appliedAt) != null && daysAgo(j.appliedAt) < 7);
  const responded = jobs.filter((j) => ['answered', 'interview', 'offer'].includes(j.status));
  const interviews = jobs.filter((j) => ['interview', 'offer'].includes(j.status));
  const followupsDue = jobs.filter(
    (j) => j.nextActionAt && new Date(j.nextActionAt).getTime() <= Date.now() && !['rejected', 'discarded', 'offer'].includes(j.status)
  );
  const rate = applied.length ? Math.round((responded.length / applied.length) * 100) : null;
  const goal = settings?.weeklyGoal || 0;

  const Chip = ({ label, value, warn, good }) => (
    <div className={`flex items-baseline gap-1.5 rounded-lg px-3 py-1 ${warn ? 'bg-amber-900/40' : good ? 'bg-emerald-900/40' : 'bg-slate-900'}`}>
      <span className={`text-base font-bold ${warn ? 'text-amber-300' : good ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950 px-4 py-2">
      <Chip label="en el tracker" value={jobs.length} />
      <Chip label="aplicadas" value={applied.length} />
      {goal > 0 ? (
        <Chip
          label={`esta semana (objetivo ${goal})`}
          value={`${appliedWeek.length}/${goal}`}
          good={appliedWeek.length >= goal}
        />
      ) : (
        <Chip label="esta semana" value={appliedWeek.length} />
      )}
      <Chip label="entrevistas" value={interviews.length} />
      {rate != null && <Chip label="tasa respuesta" value={rate + '%'} />}
      {followupsDue.length > 0 && <Chip label="follow-ups pendientes → pestaña Hoy" value={followupsDue.length} warn />}
    </div>
  );
}
