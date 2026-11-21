import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Pet, FoodItem, FeedingPlan } from '../types';
import { StorageService } from '../utils/storage';
import { getConfirmedPresentations } from '../data/foodPresentations';
import { selectFoodPackage } from '../services/onlineFoodCatalog';
import { OnlineFoodSearch } from './OnlineFoodSearch';
import { formatCOP } from '../utils/i18n';

interface UnifiedFoodSearchModalProps {
  initialQuery?: string;
  isOpen: boolean;
  onClose: () => void;
  activePet?: Pet;
  allPets?: Pet[];
  plans?: Record<string, FeedingPlan>;
  onSelectFood: (selection: {
    brand: string;
    productName: string;
    weightKg: number;
    imageUrl?: string;
    sourceFoodItem?: FoodItem;
    confirmedSizesKg?: number[];
  }) => void;
  lang?: 'es' | 'en';
  category?: 'all' | 'main' | 'snacks';
  includeArchived?: boolean;
  titleOverride?: string;
  formulaType?: Extract<FoodItem['type'], 'dry' | 'wet'>;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Resolves a high-fidelity product packshot thumbnail for foods.
 */
export function resolveFoodThumbnail(
  brand: string = '',
  name: string = '',
  species?: string,
  explicitImg?: string
): string | undefined {
  if (explicitImg && explicitImg.trim().length > 0) return explicitImg;

  const b = normalizeText(brand);
  const n = normalizeText(name);

  // Royal Canin Fit 32 / Cat
  if (n.includes('fit 32') || (b.includes('royal canin') && (species === 'cat' || n.includes('gato') || n.includes('cat')))) {
    return '/assets/food_rc_fit32.png';
  }

  // Royal Canin Dog
  if (b.includes('royal canin') || n.includes('royal canin')) {
    return '/assets/food_rc_dog.jpg';
  }

  // Purina Pro Plan
  if (b.includes('pro plan') || b.includes('purina') || n.includes('pro plan')) {
    return '/assets/food_proplan_dog.jpg';
  }

  // Hill's Science Diet
  if (b.includes('hill') || n.includes('science diet') || n.includes('hills')) {
    return '/assets/food_hills_dog.jpg';
  }

  // Agility Gold
  if (b.includes('agility') || n.includes('agility')) {
    return '/assets/food_agility_gold.jpg';
  }

  return undefined;
}

export const UnifiedFoodSearchModal: React.FC<UnifiedFoodSearchModalProps> = ({
  isOpen,
  onClose,
  activePet,
  plans = {},
  onSelectFood,
  lang = 'es',
  category = 'all',
  includeArchived = true,
  titleOverride,
  initialQuery,
  formulaType,
}) => {
  const isEs = lang === 'es';
  const [source, setSource] = useState<'internet' | 'library'>('internet');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSource('internet');
      setQuery('');
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isOpen, onClose]);

  const personalFoods = useMemo(() => {
    const planFoods = Object.values(plans).flatMap((plan) => [plan.dryFood, plan.wetFood])
      .filter((food): food is FoodItem => Boolean(food));
    const foods = [...StorageService.getCustomFoods(), ...planFoods];
    const seen = new Set<string>();
    const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
    return foods.filter((food) => {
      if (seen.has(food.id)) return false;
      seen.add(food.id);
      if (activePet && food.species !== activePet.species) return false;
      if (formulaType && (food.type !== formulaType || food.kcalPerPiece)) return false;
      if (!includeArchived && food.estadoCatalogo === 'archivado') return false;
      if (category === 'main' && food.kcalPerPiece) return false;
      if (category === 'snacks' && !food.kcalPerPiece) return false;
      const haystack = normalizeText(`${food.brand} ${food.name} ${food.barcode || ''}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [plans, activePet?.species, formulaType, category, includeArchived, query, isOpen]);

  function select(food: FoodItem) {
    onSelectFood({
      brand: food.brand,
      productName: food.name,
      weightKg: food.bagSizeKg || 0,
      imageUrl: food.imageUrl,
      sourceFoodItem: food,
      confirmedSizesKg: food.availableSizesKg,
    });
    onClose();
  }

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="food-search-title" className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 rounded-3xl border border-[#0B5D2E20] bg-white p-4 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <h3 id="food-search-title" className="font-heading text-lg font-black text-[#1C2B21]">
            {titleOverride || (isEs ? 'Buscar alimento' : 'Find food')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? 'Cerrar' : 'Close'}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="size-5" />
          </button>
        </header>
        <div role="group" aria-label={isEs ? 'Origen del alimento' : 'Food source'} className="flex shrink-0 gap-1 rounded-xl bg-[#EAF4EC] p-1">
          {(['internet', 'library'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={source === option}
              onClick={() => setSource(option)}
              className={`min-h-11 rounded-lg px-3 text-xs font-bold ${source === option ? 'bg-white text-[#0B5D2E] shadow-xs' : 'text-[#44544A]'}`}
            >
              {option === 'internet' ? 'Internet' : (isEs ? 'Mis alimentos' : 'My foods')}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {source === 'internet' ? (
            <OnlineFoodSearch
              initialQuery={initialQuery}
              species={activePet?.species || 'dog'}
              foodType={formulaType}
              lang={lang}
              onSelect={select}
            />
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">{isEs ? 'Buscar mis alimentos' : 'Search my foods'}</span>
                <Search className="absolute left-3 top-3.5 size-4 text-gray-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={isEs ? 'Marca o fórmula guardada' : 'Saved brand or formula'}
                  className="min-h-11 w-full rounded-xl border border-[#0B5D2E30] py-2 pl-9 pr-3 text-sm text-[#1C2B21]"
                />
              </label>
              {personalFoods.length === 0 && (
                <p className="text-xs text-[#44544A]">
                  {isEs ? 'No hay fichas personales que coincidan. Busca en internet o guarda la etiqueta de tu alimento.' : 'No matching personal foods. Search online or save your food label.'}
                </p>
              )}
              {personalFoods.map((food) => {
                const sizes = getConfirmedPresentations(food) || [];
                return (
                  <article key={food.id} aria-label={`${food.brand} ${food.name}`} className="space-y-2 rounded-2xl border border-gray-200 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      {food.imageUrl && <img src={food.imageUrl} alt="" className="size-12 object-contain" />}
                      <h4 className="font-bold text-[#1C2B21]">{food.brand} {food.name}</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sizes.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => select(selectFoodPackage(food, size))}
                          className="min-h-11 rounded-xl border border-[#0B5D2E40] bg-[#EAF4EC] px-3 font-bold text-[#0B5D2E]"
                        >
                          {isEs ? 'Elegir' : 'Choose'} {size < 1 ? `${size * 1000} g` : `${size} kg`}
                        </button>
                      ))}
                      {sizes.length === 0 && (
                        <button type="button" onClick={() => select(selectFoodPackage(food))} className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 font-bold text-[#0B5D2E]">
                          {isEs ? 'Elegir · empaque por confirmar' : 'Choose · package to confirm'}
                        </button>
                      )}
                    </div>
                    {food.priceBasis && (
                      <p className="text-[#44544A]">
                        {formatCOP(food.priceBasis.priceCop, true)} COP · {food.priceBasis.packageKg} kg
                      </p>
                    )}
                  </article>
                );
              })}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
