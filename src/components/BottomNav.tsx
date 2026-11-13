import React from 'react';
import { Calendar, Scale, Calculator, TrendingUp, MoreHorizontal, Users } from 'lucide-react';

export type TabId = 'today' | 'compare' | 'calculate' | 'progress' | 'more' | 'pets';

interface BottomNavProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  lang?: 'es' | 'en';
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#0B5D2E15] px-2 py-1 pb-[env(safe-area-inset-bottom,8px)] shadow-lg max-w-md mx-auto">
      <div className="flex items-center justify-around">
        {/* Tab 1: Hoy */}
        <button
          onClick={() => onTabChange('today')}
          className={`flex flex-col items-center justify-center min-h-[50px] min-w-[56px] py-1 transition-all ${
            currentTab === 'today'
              ? 'text-[#0B5D2E] font-extrabold scale-105'
              : 'text-[#44544A] hover:text-[#0B5D2E]'
          }`}
        >
          <Calendar className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'today' ? 2.5 : 2} />
          <span className="text-[11px] font-heading tracking-tight">{isEs ? 'Hoy' : 'Today'}</span>
        </button>

        {/* Tab 2: Comparador */}
        <button
          onClick={() => onTabChange('compare')}
          className={`flex flex-col items-center justify-center min-h-[50px] min-w-[56px] py-1 transition-all relative ${
            currentTab === 'compare'
              ? 'text-[#0B5D2E] font-extrabold scale-105'
              : 'text-[#44544A] hover:text-[#0B5D2E]'
          }`}
        >
          <Scale className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'compare' ? 2.5 : 2} />
          <span className="text-[11px] font-heading tracking-tight">{isEs ? 'Comparar' : 'Compare'}</span>
        </button>

        {/* Tab 3: Central Button '+ Calcular' (Naranja y un poco más grande) */}
        <button
          onClick={() => onTabChange('calculate')}
          className="flex flex-col items-center justify-center -mt-5 min-w-[64px] group focus:outline-none"
        >
          <div className="w-13 h-13 rounded-full bg-[#F57C1A] text-white flex items-center justify-center shadow-lg group-hover:bg-[#e06d12] transition-transform active:scale-95 ring-4 ring-[#EAF4EC]">
            <Calculator className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-heading font-extrabold text-[#F57C1A] mt-0.5 tracking-tight">
            + Calcular
          </span>
        </button>

        {/* Tab 4: Progreso */}
        <button
          onClick={() => onTabChange('progress')}
          className={`flex flex-col items-center justify-center min-h-[50px] min-w-[56px] py-1 transition-all ${
            currentTab === 'progress'
              ? 'text-[#0B5D2E] font-extrabold scale-105'
              : 'text-[#44544A] hover:text-[#0B5D2E]'
          }`}
        >
          <TrendingUp className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'progress' ? 2.5 : 2} />
          <span className="text-[11px] font-heading tracking-tight">{isEs ? 'Progreso' : 'Progress'}</span>
        </button>

        {/* Tab 5: Más */}
        <button
          onClick={() => onTabChange('more')}
          className={`flex flex-col items-center justify-center min-h-[50px] min-w-[56px] py-1 transition-all ${
            currentTab === 'more' || currentTab === 'pets'
              ? 'text-[#0B5D2E] font-extrabold scale-105'
              : 'text-[#44544A] hover:text-[#0B5D2E]'
          }`}
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" strokeWidth={currentTab === 'more' || currentTab === 'pets' ? 2.5 : 2} />
          <span className="text-[11px] font-heading tracking-tight">{isEs ? 'Más' : 'More'}</span>
        </button>
      </div>
    </nav>
  );
};
