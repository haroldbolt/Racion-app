import React from 'react';
import { FeedingPlan, Pet } from '../types';
import {
  FoodCompatibilityReview,
  HydrationGuidance,
  RuleSourceItem,
  TreatsGuidance,
} from '../utils/feedingGuide';
import { X, BookOpen } from 'lucide-react';

interface WhyThisResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  plan?: FeedingPlan;
  foodReview: FoodCompatibilityReview;
  hydration: HydrationGuidance;
  treats: TreatsGuidance;
  lang?: 'es' | 'en';
}

export const WhyThisResultModal: React.FC<WhyThisResultModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  foodReview,
  hydration,
  treats,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  if (!isOpen) return null;

  const allSources: RuleSourceItem[] = [
    ...foodReview.sources,
    ...hydration.sources,
    ...treats.sources,
  ];

  // Deduplicate by rule title
  const uniqueSources = allSources.filter(
    (s, idx, arr) => arr.findIndex((other) => other.rule === s.rule) === idx
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#0B5D2E]" />
            <h2 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              {isEs ? '¿Por qué me sale esto?' : 'Why am I seeing this?'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
          {/* Pet Metabolic Basis */}
          {plan && (
            <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E20] space-y-1">
              <span className="font-extrabold text-[#0B5D2E] block">
                Base metabólica de {pet.name}
              </span>
              <p className="text-[#1C2B21] font-semibold tabular-nums">
                Peso usado: {pet.currentWeightKg} kg · RER: {plan.rer} kcal · Factor: {plan.factor} → MER:{' '}
                {plan.mer} kcal/día
              </p>
              <p className="text-[#44544A]">
                Raza: {pet.breed} · Sexo: {pet.sex === 'female' ? 'Hembra' : 'Macho'} (
                {pet.isNeutered ? 'esterilizado/a' : 'entero/a'})
                {pet.expectedAdultWeightKg ? ` · Peso adulto esperado: ${pet.expectedAdultWeightKg} kg` : ''}
              </p>
            </div>
          )}

          {/* Reviewable Rules & Sources */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#44544A] block">
              Reglas revisables y fuentes aplicadas
            </span>
            {uniqueSources.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-[#F8FAF8] rounded-2xl border border-gray-200 space-y-1"
              >
                <div className="font-heading font-extrabold text-sm text-[#1C2B21]">
                  {item.rule}
                </div>
                <div className="text-[11px] font-bold text-[#0B5D2E]">
                  Fuente: {item.source}
                </div>
                <p className="text-xs text-[#44544A] leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#44544A] bg-gray-50 p-3 rounded-xl border border-gray-200 leading-relaxed">
            Esta guía es orientativa y educativa. Ante patologías, dietas terapéuticas, alimentación BARF o cambios importantes en consumo de agua, consulta siempre con tu médico veterinario.
          </p>
        </div>
      </div>
    </div>
  );
};
