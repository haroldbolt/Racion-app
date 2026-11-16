import { useId } from 'react';
import { Scale } from 'lucide-react';
import { Pet, UserAccount, WeightRecord } from '../types';
import { formatWeight } from '../utils/i18n';

interface WeightHistoryProps {
  pet: Pick<Pet, 'id' | 'name'>;
  records: WeightRecord[];
  account: Pick<UserAccount, 'language' | 'units'>;
}

export function WeightHistory({ pet, records, account }: WeightHistoryProps) {
  const titleId = useId();
  const isEs = account.language === 'es';
  const newestFirst = records
    .filter(record => record.petId === pet.id)
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section aria-labelledby={titleId} className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
      <h3 id={titleId} className="font-heading font-extrabold text-base text-[#1C2B21]">
        {isEs ? `Historial de pesajes de ${pet.name}` : `${pet.name}'s weighing history`}
      </h3>
      {newestFirst.length === 0 ? (
        <p className="text-xs text-[#44544A]">
          {isEs ? 'Aún no hay pesajes registrados.' : 'No weigh-ins recorded yet.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {newestFirst.map(record => (
            <li key={record.id} className="flex items-center justify-between p-3 rounded-xl bg-[#EAF4EC]/60 border border-[#0B5D2E15]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white text-[#0B5D2E] flex items-center justify-center border border-[#0B5D2E20]">
                  <Scale className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-heading font-extrabold text-sm text-[#1C2B21]">
                    {formatWeight(record.weightKg, account.units)}
                    {record.waistCm && (
                      <span className="text-xs text-[#44544A] ml-2 font-normal">
                        ({isEs ? 'Cintura' : 'Waist'}: {record.waistCm} cm)
                      </span>
                    )}
                  </div>
                  <time dateTime={record.date} className="text-[11px] text-[#44544A]">{record.date}</time>
                </div>
              </div>
              {record.notes && (
                <span className="text-xs text-[#0B5D2E] font-semibold max-w-[140px] truncate text-right">
                  {record.notes}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
