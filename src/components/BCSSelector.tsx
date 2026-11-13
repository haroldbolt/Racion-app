import React, { useState } from 'react';
import { Species } from '../types';
import { Eye, Check, Info, Maximize2, X, Sparkles } from 'lucide-react';

interface BCSSelectorProps {
  species: Species;
  value: number; // 1 to 9
  onChange: (val: number) => void;
  lang?: 'es' | 'en';
}

export const BCS_PHOTOS = {
  dog: {
    underweight: '/src/assets/images/bcs_dog_underweight_1794203446761.jpg',
    ideal: '/src/assets/images/bcs_dog_ideal_1794203446790.jpg',
    overweight: '/src/assets/images/bcs_dog_overweight_1794203449443.jpg',
  },
  cat: {
    underweight: '/src/assets/images/bcs_cat_underweight_1794203447633.jpg',
    ideal: '/src/assets/images/bcs_cat_ideal_1794203448613.jpg',
    overweight: '/src/assets/images/bcs_cat_overweight_1794203448533.jpg',
  },
};

export const BCSSelector: React.FC<BCSSelectorProps> = ({
  species: initialSpecies,
  value,
  onChange,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  // Allow switching species view to compare dog vs cat reference photos
  const [activeSpecies, setActiveSpecies] = useState<Species>(initialSpecies);

  // Fullscreen photo modal state
  const [modalPhoto, setModalPhoto] = useState<{ url: string; title: string; notes: string } | null>(null);

  // Determine current category from 1 to 9
  const getCategory = (score: number): 'underweight' | 'ideal' | 'overweight' => {
    if (score <= 3) return 'underweight';
    if (score <= 5) return 'ideal';
    return 'overweight';
  };

  const currentCategory = getCategory(value);

  // Detailed clinical information for each body condition tier
  const getCategoryDetails = (tier: 'underweight' | 'ideal' | 'overweight') => {
    const isDog = activeSpecies === 'dog';
    switch (tier) {
      case 'underweight':
        return {
          label: isEs ? 'Muy Delgado / Bajo Peso' : 'Underweight / Very Thin',
          range: 'BCS 1 - 3',
          bcsNum: 2,
          statusColor: '#D97706',
          statusBadge: isEs ? 'Revisemos' : "Let's review",
          photoUrl: isDog ? BCS_PHOTOS.dog.underweight : BCS_PHOTOS.cat.underweight,
          ribsText: isEs
            ? 'Costillas, columna vertebral y huesos de la cadera visibles a simple vista con mínima o nula capa grasa.'
            : 'Ribs, lumbar vertebrae and pelvic bones easily visible with minimal fat cover.',
          waistText: isEs
            ? 'Cintura muy hundida observada desde arriba y pliegue abdominal excesivamente marcado.'
            : 'Severe waistline from above and prominent abdominal tuck.',
          actionText: isEs
            ? 'Requiere ajuste calórico para recuperación de masa muscular magra.'
            : 'Requires caloric boost to safely rebuild lean muscle mass.',
        };
      case 'ideal':
        return {
          label: isEs ? 'Peso y Condición Ideal' : 'Ideal Body Condition',
          range: 'BCS 4 - 5',
          bcsNum: 5,
          statusColor: '#1E8A49',
          statusBadge: isEs ? 'Vas bien' : 'On track',
          photoUrl: isDog ? BCS_PHOTOS.dog.ideal : BCS_PHOTOS.cat.ideal,
          ribsText: isEs
            ? 'Costillas fácilmente palpables sin exceso de grasa, pero no visibles a simple vista en reposo.'
            : 'Ribs easily palpable without excess fat, not visible at rest.',
          waistText: isEs
            ? 'Cintura evidente en forma de reloj de arena vista desde arriba, y abdomen recogido visto de perfil.'
            : 'Hourglass waist visible from above and smooth abdominal tuck.',
          actionText: isEs
            ? 'Excelente estado físico. Mantenemos el cálculo estándar de mantenimiento.'
            : 'Optimal physical health. Maintain standard caloric plan.',
        };
      case 'overweight':
        return {
          label: isEs ? 'Sobrepeso u Obesidad' : 'Overweight / Obese',
          range: 'BCS 6 - 9',
          bcsNum: 7,
          statusColor: '#F57C1A',
          statusBadge: isEs ? 'Atención' : 'Attention',
          photoUrl: isDog ? BCS_PHOTOS.dog.overweight : BCS_PHOTOS.cat.overweight,
          ribsText: isEs
            ? 'Costillas difíciles de palpar bajo una capa moderada o gruesa de grasa acumulada.'
            : 'Ribs difficult to palpate under moderate to thick fat cover.',
          waistText: isEs
            ? 'Cintura ausente o ensanchada vista desde arriba; abdomen redondeado o distendido sin pliegue.'
            : 'Waist absent or broadened; rounded abdomen with no tuck.',
          actionText: isEs
            ? 'Recomendamos plan de descenso controlado para proteger articulaciones y corazón.'
            : 'Controlled weight loss plan advised to protect joints and cardiovascular health.',
        };
    }
  };

  const activeDetails = getCategoryDetails(currentCategory);

  return (
    <div className="w-full space-y-4">
      {/* Header bar: Species comparator switch & WSAVA guide badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#0B5D2E] bg-[#EAF4EC] px-2.5 py-0.5 rounded-full border border-[#0B5D2E15]">
            {isEs ? 'Guía Fotográfica WSAVA' : 'WSAVA Photo Guide'}
          </span>
          <span className="text-[11px] sm:text-xs text-gray-500 font-medium">
            {isEs ? 'Fotos reales para diferenciar' : 'Real reference photos'}
          </span>
        </div>

        {/* Dog / Cat reference photo toggle */}
        <div className="flex items-center self-start sm:self-auto bg-[#F8FAF8] p-1 rounded-xl border border-gray-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveSpecies('dog')}
            className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
              activeSpecies === 'dog'
                ? 'bg-[#0B5D2E] text-white shadow-2xs'
                : 'text-gray-600 hover:text-[#0B5D2E]'
            }`}
          >
            <span>🐶</span>
            <span>{isEs ? 'Perros' : 'Dogs'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSpecies('cat')}
            className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
              activeSpecies === 'cat'
                ? 'bg-[#0B5D2E] text-white shadow-2xs'
                : 'text-gray-600 hover:text-[#0B5D2E]'
            }`}
          >
            <span>🐱</span>
            <span>{isEs ? 'Gatos' : 'Cats'}</span>
          </button>
        </div>
      </div>

      {/* ================= PRIMARY FEATURED REAL PHOTO CARD ================= */}
      <div className="bg-white rounded-3xl overflow-hidden border-2 border-[#0B5D2E30] shadow-sm transition hover:shadow-md">
            <div className="relative aspect-[4/3] bg-gray-100 group">
              <img
                src={activeDetails.photoUrl}
                alt={`${activeDetails.label} - ${activeSpecies === 'dog' ? 'Perro' : 'Gato'}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
              />

              {/* Top overlay badge */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center flex-wrap gap-1.5">
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-heading font-black text-white shadow-md flex items-center gap-1"
                  style={{ backgroundColor: activeDetails.statusColor }}
                >
                  <span>{activeDetails.statusBadge}</span>
                  <span>•</span>
                  <span>BCS {value}/9</span>
                </span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/95 backdrop-blur-xs text-[#1C2B21] shadow-md">
                  {activeDetails.label}
                </span>
              </div>

              {/* Enlarge zoom button */}
              <button
                type="button"
                onClick={() =>
                  setModalPhoto({
                    url: activeDetails.photoUrl,
                    title: `${activeDetails.label} (${activeSpecies === 'dog' ? 'Canino' : 'Felino'})`,
                    notes: `${activeDetails.ribsText} ${activeDetails.waistText}`,
                  })
                }
                className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-xl backdrop-blur-xs transition shadow-md flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title={isEs ? 'Ampliar foto real' : 'Enlarge photo'}
              >
                <Maximize2 className="w-4 h-4" />
                <span className="hidden sm:inline">{isEs ? 'Ver foto completa' : 'Enlarge'}</span>
              </button>
            </div>

            {/* Anatomical Key Points Accordion */}
            <div className="p-4 space-y-3 bg-white">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-heading font-extrabold text-base text-[#1C2B21]">
                    {activeDetails.label} ({activeDetails.range})
                  </h4>
                  <span className="text-xs font-bold text-[#0B5D2E]">
                    {activeSpecies === 'dog' ? (isEs ? 'Referencia Canina' : 'Canine') : (isEs ? 'Referencia Felina' : 'Feline')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeDetails.actionText}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                <div className="bg-[#F8FAF8] p-2.5 rounded-xl border border-gray-100 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#0B5D2E] block">
                    {isEs ? '🔍 Palpación de Costillas:' : '🔍 Rib Palpation:'}
                  </span>
                  <p className="text-gray-700 leading-snug">
                    {activeDetails.ribsText}
                  </p>
                </div>

                <div className="bg-[#F8FAF8] p-2.5 rounded-xl border border-gray-100 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#F57C1A] block">
                    {isEs ? '🔍 Vista Superior y Cintura:' : '🔍 Waist & Silhouette:'}
                  </span>
                  <p className="text-gray-700 leading-snug">
                    {activeDetails.waistText}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 3-TIER COMPARATIVE PHOTOGRAPHIC GALLERY ================= */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-gray-600 block">
              {isEs
                ? 'Selecciona la foto real que más se parece a tu mascota:'
                : 'Select the real photo that best matches your pet:'}
            </span>

            <div className="grid grid-cols-3 gap-2">
              {(['underweight', 'ideal', 'overweight'] as const).map((tier) => {
                const details = getCategoryDetails(tier);
                const isSelected = currentCategory === tier;

                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => onChange(details.bcsNum)}
                    className={`flex flex-col rounded-2xl overflow-hidden border-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#0B5D2E] ring-2 ring-[#0B5D2E]/20 shadow-md scale-101'
                        : 'border-gray-200 hover:border-gray-300 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-gray-100 w-full overflow-hidden">
                      <img
                        src={details.photoUrl}
                        alt={details.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#0B5D2E] text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <span
                        className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black text-white"
                        style={{ backgroundColor: details.statusColor }}
                      >
                        {details.range}
                      </span>
                    </div>

                    <div className={`p-2 w-full text-center ${isSelected ? 'bg-[#EAF4EC]' : 'bg-white'}`}>
                      <span className={`text-[11px] font-extrabold block truncate ${isSelected ? 'text-[#0B5D2E]' : 'text-gray-700'}`}>
                        {tier === 'underweight' ? (isEs ? 'Delgado' : 'Thin') : tier === 'ideal' ? (isEs ? 'Ideal' : 'Ideal') : (isEs ? 'Sobrepeso' : 'Overweight')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

      {/* ================= 1-9 FINE-TUNE PRECISION SLIDER ================= */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#0B5D2E15] shadow-xs space-y-2">
        <div className="flex justify-between items-center gap-1 text-[10px] sm:text-xs font-bold text-[#44544A]">
          <span>1 ({isEs ? 'Muy Delgado' : 'Emaciated'})</span>
          <span className="text-[#1E8A49] font-black">5 ({isEs ? 'Ideal' : 'Ideal'})</span>
          <span className="text-right">9 ({isEs ? 'Obesidad' : 'Obese'})</span>
        </div>

        <input
          type="range"
          min="1"
          max="9"
          step="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-3 bg-[#EAF4EC] rounded-lg appearance-none cursor-pointer accent-[#0B5D2E]"
        />

        <div className="flex justify-between text-[11px] text-[#44544A] font-semibold px-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
            const isCurrent = value === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`w-6 h-6 rounded-lg text-center transition flex items-center justify-center font-mono ${
                  isCurrent
                    ? 'bg-[#0B5D2E] text-white font-black shadow-xs scale-110'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="pt-2 text-center">
          <p className="text-[11px] text-[#44544A]">
            {isEs
              ? '💡 Consejo veterinario: Pasa tus dedos por las costillas. Con BCS 5 se deben sentir como el dorso de tu mano cerrada.'
              : '💡 Vet tip: Run your fingers gently over the ribs. At BCS 5 they should feel like the knuckles on the back of your hand.'}
          </p>
        </div>
      </div>

      {/* ================= FULLSCREEN ENLARGED PHOTO MODAL ================= */}
      {modalPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setModalPhoto(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-4 space-y-3 relative shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h5 className="font-heading font-extrabold text-sm text-[#1C2B21]">
                {modalPhoto.title}
              </h5>
              <button
                type="button"
                onClick={() => setModalPhoto(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
              <img
                src={modalPhoto.url}
                alt={modalPhoto.title}
                referrerPolicy="no-referrer"
                className="w-full h-auto object-contain max-h-[60vh] mx-auto"
              />
            </div>

            <p className="text-xs text-gray-600 bg-[#F8FAF8] p-3 rounded-xl border border-gray-100 leading-relaxed">
              {modalPhoto.notes}
            </p>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setModalPhoto(null)}
                className="px-5 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold hover:bg-[#094723] transition"
              >
                {isEs ? 'Entendido' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
