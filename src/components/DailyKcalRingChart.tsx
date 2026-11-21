import type { ReactNode } from 'react';
import type { NextMealStatus } from '../utils/feedingGuide';

interface Props {
  name: string;
  status: NextMealStatus;
  hasEnergyForPlan: boolean;
  lang: 'es' | 'en';
  children: ReactNode;
}

function ProgressArc({ radius, progress, color }: { radius: number; progress?: number; color: string }) {
  const length = 2 * Math.PI * radius;
  return (
    <g fill="none" strokeWidth="8">
      <circle cx="64" cy="64" r={radius} stroke={progress === undefined ? '#CBD5D0' : '#E9EFEB'}
        strokeDasharray={progress === undefined ? '2 5' : undefined} />
      {progress !== undefined && progress > 0 && <circle cx="64" cy="64" r={radius} stroke={color} strokeLinecap="round"
        strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(1, progress))}
        transform="rotate(-90 64 64)" />}
    </g>
  );
}

export function DailyKcalRingChart({ name, status, hasEnergyForPlan, lang, children }: Props) {
  const es = lang === 'es';
  const { completedMealsCount: count, totalMealsCount: total, consumedKcalTotal: kcal, targetKcalTotal: target } = status;
  const knownEnergy = !status.energyIncomplete && (hasEnergyForPlan || count > 0);
  const knownProgress = knownEnergy && target > 0;
  return (
    <section aria-labelledby="today-progress-title" className="space-y-3 rounded-3xl border border-[#0B5D2E20] bg-white p-4 shadow-sm">
      <h2 id="today-progress-title" className="font-heading text-lg font-extrabold text-[#1C2B21]">
        {es ? 'Progreso diario de ' + name : name + '’s daily progress'}
      </h2>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="relative size-[126px] shrink-0 sm:size-[142px]">
          <svg viewBox="0 0 128 128" aria-hidden="true" className="size-full">
            <ProgressArc radius={57} progress={knownProgress ? kcal / target : undefined} color={kcal > target ? '#B45309' : '#117143'} />
            <ProgressArc radius={45} progress={total ? count / total : undefined} color="#0284C7" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <strong className="font-heading text-2xl font-black leading-tight tabular-nums text-[#1C2B21]">{total ? count + '/' + total : '—'}</strong>
            <span className="text-[11px] font-semibold text-[#44544A]">{es ? 'tomas' : 'meals'}</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-bold text-[#1C2B21]"><span className="mr-1 inline-block size-2 rounded-full bg-sky-600" />
            {total ? (es ? count + ' de ' + total + ' comidas' : count + ' of ' + total + ' meals') : (es ? 'Sin plan todavía' : 'No plan yet')}
          </p>
          <p className="font-bold text-[#0B5D2E]"><span className="mr-1 inline-block size-2 rounded-full bg-[#117143]" />
            {knownProgress ? kcal + ' / ' + target + ' kcal' : es ? 'Calorías pendientes' : 'Calories pending'}
          </p>
          {!knownProgress && (kcal > 0 || target > 0) && <p className="text-xs text-[#44544A]">
            {kcal > 0 && (es ? kcal + ' kcal registradas. ' : kcal + ' kcal logged. ')}
            {target > 0 && (es ? 'Meta ' : 'Goal ') + target + ' kcal'}
          </p>}
          {knownProgress && kcal > target && <p className="text-xs font-semibold text-amber-800">{es ? 'Sobre la meta por ' : 'Over goal by '}{kcal - target} kcal</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
