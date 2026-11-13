import React, { useState } from 'react';
import { X, MapPin, Compass, Check, Search } from 'lucide-react';
import { ALL_CITIES, PRIMARY_CITIES } from '../contexts/CityContext';

interface CityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  onDetectLocation: () => Promise<string | null>;
  isDetecting: boolean;
  lang?: 'es' | 'en';
}

export const CityPickerModal: React.FC<CityPickerModalProps> = ({
  isOpen,
  onClose,
  selectedCity,
  onSelectCity,
  onDetectLocation,
  isDetecting,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const [searchFilter, setSearchFilter] = useState('');
  const [detectNotice, setDetectNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredCities = ALL_CITIES.filter((c) =>
    c.toLowerCase().includes(searchFilter.trim().toLowerCase())
  );

  const handleDetect = async () => {
    setDetectNotice(null);
    const detected = await onDetectLocation();
    if (detected) {
      setDetectNotice(isEs ? `Ubicación detectada: ${detected}` : `Location detected: ${detected}`);
      setTimeout(() => {
        onClose();
      }, 800);
    } else {
      setDetectNotice(
        isEs
          ? 'No pudimos acceder a tu ubicación. Selecciona tu ciudad en la lista.'
          : 'Could not access location. Select your city below.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-[#0B5D2E20] space-y-4 relative max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center">
              <MapPin className="w-4 h-4 text-[#F57C1A]" />
            </div>
            <div>
              <h3 className="font-heading font-black text-base text-[#1C2B21]">
                {isEs ? 'Ciudad de entrega' : 'Delivery city'}
              </h3>
              <p className="text-[11px] text-[#44544A]">
                {isEs ? 'Consulta comercios con cobertura real' : 'Check stores with verified delivery'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* GPS location button (only asks permission on click) */}
        <button
          type="button"
          onClick={handleDetect}
          disabled={isDetecting}
          className="w-full py-2.5 px-3 bg-[#EAF4EC] hover:bg-[#d9ecd9] border border-[#0B5D2E25] rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-[#0B5D2E] transition active:scale-98 disabled:opacity-60 shrink-0"
        >
          <Compass className={`w-4 h-4 ${isDetecting ? 'animate-spin' : ''}`} />
          <span>
            {isDetecting
              ? (isEs ? 'Detectando tu ubicación...' : 'Detecting location...')
              : (isEs ? 'Usar mi ubicación actual' : 'Use my current location')}
          </span>
        </button>

        {detectNotice && (
          <p className="text-[11px] font-semibold text-center text-[#0B5D2E] bg-emerald-50 p-2 rounded-xl border border-emerald-200">
            {detectNotice}
          </p>
        )}

        {/* Quick filter search */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={isEs ? 'Buscar ciudad...' : 'Search city...'}
            className="w-full pl-8 pr-3 py-1.5 bg-[#F8FAF8] border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0B5D2E]"
          />
        </div>

        {/* Cities list */}
        <div className="overflow-y-auto space-y-1.5 flex-1 pr-0.5">
          {filteredCities.map((cityName) => {
            const isSelected = cityName.toLowerCase() === selectedCity.toLowerCase();
            return (
              <button
                key={cityName}
                type="button"
                onClick={() => {
                  onSelectCity(cityName);
                  onClose();
                }}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-left flex items-center justify-between transition min-h-[44px] ${
                  isSelected
                    ? 'bg-[#0B5D2E] text-white shadow-xs'
                    : 'bg-[#F8FAF8] text-[#1C2B21] hover:bg-[#EAF4EC] hover:text-[#0B5D2E]'
                }`}
              >
                <span>{cityName}</span>
                {isSelected && <Check className="w-4 h-4 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
