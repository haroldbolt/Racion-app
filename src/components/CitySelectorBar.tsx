import React, { useState } from 'react';
import { useCity } from '../contexts/CityContext';
import { MapPin, Compass, Check, ChevronDown } from 'lucide-react';

interface CitySelectorBarProps {
  className?: string;
  lang?: 'es' | 'en';
  onCityChanged?: (city: string) => void;
}

export const CitySelectorBar: React.FC<CitySelectorBarProps> = ({
  className = '',
  lang = 'es',
  onCityChanged,
}) => {
  const isEs = lang === 'es';
  const { selectedCity, setCity, isDetecting, detectLocation, primaryCities, allCities } = useCity();

  const [showAllDropdown, setShowAllDropdown] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSelectCity = (city: string) => {
    setCity(city);
    setShowAllDropdown(false);
    setToastMessage(isEs ? `Ubicación actualizada: ${city}` : `Location updated: ${city}`);
    setTimeout(() => setToastMessage(null), 2500);
    if (onCityChanged) onCityChanged(city);
  };

  const handleAutoDetect = async () => {
    const detected = await detectLocation();
    if (detected) {
      setToastMessage(isEs ? `¡Ubicación detectada: ${detected}!` : `Location detected: ${detected}!`);
      setTimeout(() => setToastMessage(null), 3000);
      if (onCityChanged) onCityChanged(detected);
    } else {
      setToastMessage(
        isEs
          ? 'No pudimos acceder a tu GPS. Selecciona tu ciudad en los botones.'
          : 'Could not access GPS. Please select your city.'
      );
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const isPrimary = primaryCities.includes(selectedCity as any);

  return (
    <div className={`bg-white rounded-3xl p-3.5 border border-[#0B5D2E18] shadow-xs space-y-2.5 transition-all ${className}`}>
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-[#0B5D2E]" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44544A] block">
              {isEs ? 'Ciudad para ofertas y envíos' : 'City for deals & delivery'}
            </span>
            <span className="font-heading font-extrabold text-sm text-[#1C2B21]">
              {selectedCity}
            </span>
          </div>
        </div>

        {/* GPS Auto-detect button */}
        <button
          type="button"
          onClick={handleAutoDetect}
          disabled={isDetecting}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#EAF4EC] hover:bg-[#d5ebd7] text-[#0B5D2E] text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50 min-h-[32px]"
          title={isEs ? 'Detectar ciudad con GPS' : 'Detect city with GPS'}
        >
          <Compass className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {isDetecting ? (isEs ? 'Detectando...' : 'Detecting...') : (isEs ? 'Mi ubicación' : 'My location')}
          </span>
        </button>
      </div>

      {/* 4 Primary Cities Selector (Bogotá, Medellín, Cali, Barranquilla) */}
      <div className="grid grid-cols-4 gap-1.5">
        {primaryCities.map((city) => {
          const isSelected = selectedCity === city;
          return (
            <button
              key={city}
              type="button"
              onClick={() => handleSelectCity(city)}
              className={`py-2 px-1.5 rounded-2xl text-xs font-heading font-bold transition flex items-center justify-center gap-1 active:scale-95 min-h-[38px] ${
                isSelected
                  ? 'bg-[#0B5D2E] text-white shadow-xs'
                  : 'bg-[#EAF4EC]/50 text-[#1C2B21] hover:bg-[#EAF4EC] border border-[#0B5D2E12]'
              }`}
            >
              {isSelected && <Check className="w-3 h-3 stroke-[3] shrink-0" />}
              <span className="truncate">{city}</span>
            </button>
          );
        })}
      </div>

      {/* Extra Cities toggle dropdown */}
      <div className="flex items-center justify-between text-[11px] pt-0.5">
        <span className="text-[#44544A] italic text-[10px]">
          {isEs ? '✓ Filtra tiendas y cobertura en Google Shopping' : '✓ Filters Google Shopping stores & delivery'}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAllDropdown(!showAllDropdown)}
            className="flex items-center gap-1 text-[#0B5D2E] hover:underline font-extrabold cursor-pointer"
          >
            <span>{isPrimary ? (isEs ? 'Más ciudades' : 'More cities') : selectedCity}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showAllDropdown && (
            <div className="absolute right-0 bottom-full mb-1 z-30 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 w-48 animate-in fade-in slide-in-from-bottom-2">
              <span className="px-3 py-1 text-[10px] font-bold uppercase text-gray-400 block border-b border-gray-100">
                {isEs ? 'Otras ciudades' : 'Other cities'}
              </span>
              {allCities.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleSelectCity(c)}
                  className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between hover:bg-[#EAF4EC] transition ${
                    selectedCity === c ? 'text-[#0B5D2E] font-bold bg-[#EAF4EC]/60' : 'text-gray-700'
                  }`}
                >
                  <span>{c}</span>
                  {selectedCity === c && <Check className="w-3.5 h-3.5 text-[#0B5D2E]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {toastMessage && (
        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
