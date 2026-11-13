import React from 'react';
import { Pet, FeedingPlan, UserAccount } from '../types';
import { formatWeight, formatRation } from '../utils/i18n';
import { Plus, Edit3, ChevronRight, Check, Sparkles } from 'lucide-react';

interface PetsViewProps {
  pets: Pet[];
  activePetId: string;
  plans: Record<string, FeedingPlan>;
  userAccount: UserAccount;
  onSelectPet: (id: string) => void;
  onEditPet: (pet: Pet) => void;
  onAddNewPet: () => void;
  onCalculateRation: (petId: string) => void;
}

export const PetsView: React.FC<PetsViewProps> = ({
  pets,
  activePetId,
  plans,
  userAccount,
  onSelectPet,
  onEditPet,
  onAddNewPet,
  onCalculateRation,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;

  return (
    <div className="p-4 space-y-4 pb-28 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-2xl text-[#0B5D2E]">
            {isEs ? 'Mis Mascotas' : 'My Pets'}
          </h2>
          <p className="text-xs text-[#44544A] mt-0.5">
            {isEs
              ? 'Mascotas ilimitadas en tu cuenta familiar'
              : 'Unlimited pets in your family account'}
          </p>
        </div>

        <button
          onClick={onAddNewPet}
          className="min-h-[44px] px-3.5 py-2 bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-xs flex items-center gap-1.5 shadow-sm hover:bg-[#094723] transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>{isEs ? '+ Mascota' : '+ Pet'}</span>
        </button>
      </div>

      <div className="space-y-3">
        {pets.map((p) => {
          const isSelected = p.id === activePetId;
          const petPlan = plans[p.id];

          return (
            <div
              key={p.id}
              className={`bg-white rounded-3xl p-5 border-2 transition-all space-y-4 ${
                isSelected
                  ? 'border-[#0B5D2E] shadow-md ring-2 ring-[#0B5D2E]/10'
                  : 'border-[#0B5D2E15] shadow-xs hover:border-[#0B5D2E40]'
              }`}
            >
              {/* Pet Card Header */}
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3 cursor-pointer flex-1"
                  onClick={() => onSelectPet(p.id)}
                >
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#EAF4EC] border-2 border-white shadow-xs shrink-0 flex items-center justify-center text-2xl font-bold">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{p.species === 'dog' ? '🐶' : '🐱'}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
                        {p.name}
                      </h3>
                      {isSelected && (
                        <span className="text-[10px] font-extrabold bg-[#0B5D2E] text-white px-2 py-0.5 rounded-full">
                          {isEs ? 'Activa' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#44544A]">
                      {p.breed} • {p.sex === 'female' ? (isEs ? '♀ Hembra' : '♀ Female') : (isEs ? '♂ Macho' : '♂ Male')} • {p.species === 'dog' ? (isEs ? 'Perro' : 'Dog') : (isEs ? 'Gato' : 'Cat')} • {p.ageYears} {isEs ? 'años' : 'yrs'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onEditPet(p)}
                  className="p-2.5 rounded-xl text-[#44544A] hover:bg-[#EAF4EC] hover:text-[#0B5D2E] transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Editar perfil"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              {/* Stats Grid: Current Weight, Target, BCS */}
              <div className="grid grid-cols-3 gap-2 bg-[#F8FAF8] p-3 rounded-2xl border border-gray-100 text-xs">
                <div>
                  <span className="text-[#44544A] block">{isEs ? 'Peso actual:' : 'Current:'}</span>
                  <strong className="text-sm font-bold text-[#1C2B21]">
                    {formatWeight(p.currentWeightKg, units)}
                  </strong>
                </div>

                <div>
                  <span className="text-[#44544A] block">{isEs ? 'Peso meta:' : 'Goal:'}</span>
                  <strong className="text-sm font-bold text-[#0B5D2E]">
                    {formatWeight(p.targetWeightKg || p.idealWeightKg, units)}
                  </strong>
                </div>

                <div>
                  <span className="text-[#44544A] block">{isEs ? 'Condición:' : 'BCS:'}</span>
                  <strong className="text-sm font-bold text-[#1C2B21]">
                    {p.bcs}/9
                  </strong>
                </div>
              </div>

              {/* Ration Plan Summary if available */}
              {petPlan ? (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <div className="text-xs">
                    <span className="text-[#44544A] block">{isEs ? 'Ración recomendada:' : 'Ration:'}</span>
                    <strong className="font-heading font-black text-base text-[#1C2B21]">
                      {formatRation(petPlan.gramsPerMeal, units)}{' '}
                      <span className="text-xs font-normal text-[#44544A]">
                        {isEs ? 'por comida' : 'per meal'} ({petPlan.mealsPerDay} tomas)
                      </span>
                    </strong>
                  </div>

                  <button
                    onClick={() => {
                      onSelectPet(p.id);
                      onCalculateRation(p.id);
                    }}
                    className="text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 min-h-[44px]"
                  >
                    <span>{isEs ? 'Recalcular' : 'Recalculate'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="pt-1">
                  <button
                    onClick={() => {
                      onSelectPet(p.id);
                      onCalculateRation(p.id);
                    }}
                    className="w-full py-2.5 bg-[#F57C1A] text-white rounded-xl font-heading font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#e06d12] transition min-h-[44px]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isEs ? 'Calcular primera ración' : 'Calculate first ration'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
