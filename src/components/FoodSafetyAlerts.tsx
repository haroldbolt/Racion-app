import { AlertTriangle, Info } from 'lucide-react';
import type { FeedingPlan, FoodItem, Pet } from '../types';
import { assessFoodForPet, assessVetLimits, getPlanSafetyNotices, type FoodSafetyNotice } from '../utils/foodSafety';

function NoticeList({ notices, pet, lang }: { notices: FoodSafetyNotice[]; pet: Pet; lang: 'es' | 'en' }) {
  if (!notices.length) return null;
  const heading = lang === 'es' ? `Revisión para ${pet.name}` : `Review for ${pet.name}`;
  return <section aria-label={heading} className="space-y-2 rounded-2xl border border-[#d4ddd5] bg-white p-3">
    <h3 className="text-sm font-extrabold text-[#1C2B21]">{heading}</h3>
    <ul className="space-y-2 text-xs leading-relaxed">
      {notices.map((notice) => {
        const Icon = notice.level === 'mismatch' ? AlertTriangle : Info;
        return <li key={notice.key} className={`flex items-start gap-2 rounded-lg p-2 ${notice.level === 'mismatch' ? 'bg-[#fff3e3] text-[#783609]' : 'bg-[#f4f7f4] text-[#37483c]'}`}>
          <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{notice.message}</span>
        </li>;
      })}
    </ul>
  </section>;
}

export function FoodSafetyAlerts({pet, food, lang = 'es'}: {pet: Pet; food: FoodItem; lang?: 'es' | 'en'}) {
  return <NoticeList notices={[...assessFoodForPet(pet, food, true, lang), ...assessVetLimits(pet, [{food}], lang)]} pet={pet} lang={lang} />;
}

export function PlanSafetyAlerts({pet, plan, lang = 'es'}: {pet: Pet; plan: FeedingPlan; lang?: 'es' | 'en'}) {
  return <NoticeList notices={getPlanSafetyNotices(pet, plan, lang)} pet={pet} lang={lang} />;
}
