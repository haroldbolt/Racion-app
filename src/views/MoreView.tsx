import React, { useState } from 'react';
import { Pet, FeedingPlan, UserAccount, WeightRecord, HealthLog, FoodItem, VetGuideline } from '../types';
import { FoodsView } from './FoodsView';
import { VetView } from './VetView';
import { SettingsView } from './SettingsView';
import {
  UtensilsCrossed,
  Stethoscope,
  ShoppingBag,
  Users,
  Settings,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Sun,
  Moon,
  DollarSign,
  HardDrive,
} from 'lucide-react';
import { FoodCostTracker } from '../components/FoodCostTracker';

interface MoreViewProps {
  pet?: Pet;
  pets?: Pet[];
  plan?: FeedingPlan;
  weightRecords: WeightRecord[];
  healthLogs: HealthLog[];
  userAccount: UserAccount;
  onUpdateAccount: (updated: Partial<UserAccount>) => void;
  onUpdateVetGuideline: (guideline: VetGuideline | undefined) => void;
  onSelectFoodForPet: (food: FoodItem) => void;
  onResetAllData: () => void;
  initialSubSection?: string | null;
  onNavigateTab?: (tab: 'pets' | 'compare' | 'calculate' | 'today' | 'progress') => void;
}

export const MoreView: React.FC<MoreViewProps> = ({
  pet,
  pets = [],
  plan,
  weightRecords,
  healthLogs,
  userAccount,
  onUpdateAccount,
  onUpdateVetGuideline,
  onSelectFoodForPet,
  onResetAllData,
  initialSubSection = null,
  onNavigateTab,
}) => {
  const isEs = userAccount.language === 'es';
  // Subsections inside "Más"
  const [currentSection, setCurrentSection] = useState<string | null>(initialSubSection);

  // If a subsection is opened, render it with Back button to "Más" list
  if (pet && currentSection === 'foods') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <FoodsView
          pet={pet}
          merTargetKcal={plan?.mer || 600}
          userAccount={userAccount}
          onSelectFoodForPet={(food) => {
            onSelectFoodForPet(food);
            setCurrentSection(null);
          }}
          onClose={() => setCurrentSection(null)}
        />
      </div>
    );
  }

  if (pet && currentSection === 'vet') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <VetView
          pet={pet}
          plan={plan}
          weightRecords={weightRecords}
          healthLogs={healthLogs}
          userAccount={userAccount}
          onUpdateVetGuideline={onUpdateVetGuideline}
        />
      </div>
    );
  }

  if (pet && plan && plan.gramsPerDay > 0 && currentSection === 'shop') {
    return (
      <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
        <button
          onClick={() => setCurrentSection(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
        </button>

        <div className="bg-white rounded-3xl p-6 border border-[#0B5D2E20] shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EAF4EC] rounded-2xl text-[#0B5D2E]">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-xl text-[#0B5D2E]">
                {isEs ? 'Tienda y Recompra de Alimento' : 'Food Reorder & Stores'}
              </h3>
              <p className="text-xs text-[#44544A]">
                {isEs ? 'Consulta cuánto dura un bulto según la ración guardada.' : 'See how long a bag lasts with the saved portion.'}
              </p>
            </div>
          </div>

          <div className="bg-[#EAF4EC] p-4 rounded-2xl border border-[#0B5D2E15] space-y-2">
            <span className="text-xs font-bold text-[#0B5D2E] uppercase block">
              {isEs ? 'Alimento configurado para ' : 'Configured food for '} {pet.name}:
            </span>
            <h4 className="font-heading font-black text-lg text-[#1C2B21]">
              {plan?.foodBrand} {plan?.foodName}
            </h4>
            <div className="flex justify-between items-center text-xs text-[#44544A] pt-1">
              <span>{isEs ? 'Ración:' : 'Daily ration:'} <strong>{plan.gramsPerDay} {isEs ? 'g/día' : 'g/day'}</strong></span>
              {plan.bagDaysRemaining != null && plan.bagDaysRemaining > 0 && (
                <span className="font-extrabold text-[#0B5D2E]">
                  {isEs ? `Duración: ~${plan.bagDaysRemaining} días` : `Lasts ~${plan.bagDaysRemaining} days`}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href={`https://www.google.com/search?q=comprar+alimento+${encodeURIComponent(plan?.foodBrand || '')}+${encodeURIComponent(plan?.foodName || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[52px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#e06d12] transition shadow-md active:scale-95"
            >
              <span>{isEs ? 'Buscar alimento en Google' : 'Search for food on Google'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <p className="text-[11px] text-[#44544A] text-center">
              {isEs
                ? 'Abre una búsqueda de este alimento en otra pestaña.'
                : 'Opens a search for this food in another tab.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (pet && currentSection === 'food_costs') {
    return (
      <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
        <button
          onClick={() => setCurrentSection(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
        </button>
        <FoodCostTracker
          key={pet.id}
          pet={pet}
          plan={plan}
          userAccount={userAccount}
        />
      </div>
    );
  }

  if (currentSection === 'settings') {
    return (
      <div>
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <button
            onClick={() => setCurrentSection(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0B5D2E] hover:underline py-1.5 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isEs ? '← Volver a Más' : '← Back to More'}</span>
          </button>
        </div>
        <SettingsView
          userAccount={userAccount}
          pets={pets}
          onUpdateAccount={onUpdateAccount}
          onResetAllData={onResetAllData}
        />
      </div>
    );
  }

  // Tools available in the local beta
  const menuItems = [
    {
      id: 'pets',
      title: isEs ? 'Mis Mascotas' : 'My Pets',
      subtitle: isEs
        ? 'Gestionar perfiles, agregar nuevas mascotas o cambiar mascota activa'
        : 'Manage profiles, add new pets or switch active pet',
      icon: <Users className="w-5 h-5 text-[#0B5D2E]" />,
    },
    {
      id: 'foods',
      title: isEs ? 'Alimentos y Comparador' : 'Food Catalog & Comparer',
      subtitle: isEs
        ? 'Catálogo local, comparación nutricional y alimentos tóxicos'
        : 'Local catalog, nutrition comparison and toxic foods',
      icon: <UtensilsCrossed className="w-5 h-5 text-[#0B5D2E]" />,
      badge: isEs ? 'Nutrición' : 'Nutrition',
    },
    {
      id: 'vet',
      title: isEs ? 'Módulo Veterinario y Urgencias' : 'Veterinary Module & 24h',
      subtitle: isEs
        ? 'Pauta médica con bloqueo, informe PDF para el médico y ficha de emergencia'
        : 'Vet guideline lock, official PDF report and emergency protocol',
      icon: <Stethoscope className="w-5 h-5 text-[#0B5D2E]" />,
      badge: isEs ? 'Salud' : 'Health',
    },
    {
      id: 'shop',
      title: isEs ? 'Recompra y Duración del Bulto' : 'Food Reorder & Bag Alert',
      subtitle: isEs
        ? 'Duración estimada del bulto y búsqueda del alimento'
        : 'Estimated bag duration and food search',
      icon: <ShoppingBag className="w-5 h-5 text-[#F57C1A]" />,
    },
    {
      id: 'food_costs',
      title: isEs ? 'Gastos en Comida ($ COP)' : 'Food Expenses ($ COP)',
      subtitle: isEs
        ? 'Sube tus facturas, recibos y supervisa el gasto diario/mensual en Pesos Colombianos'
        : 'Log purchases, receipts, and monitor daily/monthly food expenses in COP',
      icon: <DollarSign className="w-5 h-5 text-[#0B5D2E]" />,
      badge: '$ COP',
    },
    {
      id: 'settings',
      title: isEs ? 'Ajustes y Privacidad' : 'Settings & Privacy',
      subtitle: isEs
        ? 'Idioma, unidades, exportaciones y datos guardados'
        : 'Language, units, exports and stored data',
      icon: <Settings className="w-5 h-5 text-[#44544A]" />,
    },
  ].filter((item) => {
    if (item.id === 'shop') return pet && plan && plan.gramsPerDay > 0;
    return pet || item.id === 'pets' || item.id === 'settings';
  });

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      <div>
        <h2 className="font-heading font-extrabold text-2xl text-[#0B5D2E]">
          {isEs ? 'Más opciones' : 'More options'}
        </h2>
        <p className="text-xs text-[#44544A] mt-0.5">
          {isEs
            ? 'Herramientas avanzadas organizadas por frecuencia de uso'
            : 'Advanced tools organized by frequency of use'}
        </p>
      </div>

      {/* Visual Mode Selector (Claro / Oscuro) - Persists in userAccount */}
      <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E18] shadow-sm flex items-center justify-between gap-3 transition-all">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#EAF4EC] text-[#0B5D2E] shrink-0">
            {userAccount.theme === 'dark' ? (
              <Moon className="w-5 h-5 text-[#27AE60]" />
            ) : (
              <Sun className="w-5 h-5 text-[#F57C1A]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                {isEs ? 'Modo Visual' : 'Visual Theme'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                {userAccount.theme === 'dark' ? (isEs ? 'Oscuro' : 'Dark') : (isEs ? 'Claro' : 'Light')}
              </span>
            </div>
            <p className="text-xs text-[#44544A] mt-0.5">
              {userAccount.theme === 'dark'
                ? (isEs ? 'Fondo oscuro con acento verde de marca' : 'Dark slate with brand green accents')
                : (isEs ? 'Fondo claro natural con acento verde' : 'Light natural with brand green accents')}
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center bg-[#EAF4EC] p-1 rounded-2xl border border-[#0B5D2E15] shrink-0">
          <button
            type="button"
            onClick={() => onUpdateAccount({ theme: 'light' })}
            aria-label={isEs ? 'Cambiar a modo claro' : 'Switch to light mode'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-bold transition-all min-h-[40px] ${
              userAccount.theme !== 'dark'
                ? 'bg-white text-[#0B5D2E] shadow-sm ring-1 ring-black/5'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            <Sun className={`w-4 h-4 ${userAccount.theme !== 'dark' ? 'text-[#F57C1A]' : ''}`} />
            <span className="hidden sm:inline">{isEs ? 'Claro' : 'Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateAccount({ theme: 'dark' })}
            aria-label={isEs ? 'Cambiar a modo oscuro' : 'Switch to dark mode'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-bold transition-all min-h-[40px] ${
              userAccount.theme === 'dark'
                ? 'bg-[#1E8A49] text-white shadow-sm'
                : 'text-[#44544A] hover:text-[#0B5D2E]'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span className="hidden sm:inline">{isEs ? 'Oscuro' : 'Dark'}</span>
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-white rounded-3xl p-4 border border-[#0B5D2E18] shadow-sm">
        <div className="p-2.5 bg-[#EAF4EC] rounded-2xl text-[#0B5D2E] shrink-0">
          <HardDrive className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
            {isEs ? 'Datos en este navegador' : 'Data in this browser'}
          </h3>
          <p className="text-xs text-[#44544A] mt-0.5">
            {isEs
              ? 'Tus mascotas, raciones y registros se guardan aquí. Descarga una copia desde Ajustes.'
              : 'Your pets, rations and records are saved here. Download a copy from Settings.'}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'pets' && onNavigateTab) {
                onNavigateTab('pets');
              } else if (item.id === 'foods' && onNavigateTab) {
                onNavigateTab('compare');
              } else {
                setCurrentSection(item.id);
              }
            }}
            className="w-full bg-white p-4 rounded-3xl border border-[#0B5D2E18] shadow-sm hover:border-[#0B5D2E40] transition text-left flex items-center justify-between min-h-[68px] active:scale-99"
          >
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-[#EAF4EC] shrink-0">
                {item.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-extrabold text-base text-[#1C2B21]">
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E20]">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#44544A] mt-0.5 line-clamp-1">
                  {item.subtitle}
                </p>
              </div>
            </div>

            <ChevronRight className="w-5 h-5 text-[#44544A] shrink-0 ml-2" />
          </button>
        ))}
      </div>

      {/* Brand card at bottom of More */}
      <div className="bg-[#EAF4EC] p-4 rounded-3xl border border-[#0B5D2E15] text-center space-y-1">
        <span className="font-heading font-extrabold text-sm text-[#0B5D2E]">
          Ración App • Beta
        </span>
        <p className="text-[11px] text-[#44544A]">
          {isEs
            ? 'Calcula raciones y lleva el diario de tus mascotas.'
            : 'Estimate portions and keep a diary for your pets.'}
        </p>
      </div>
    </div>
  );
};
