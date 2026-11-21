import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Search } from 'lucide-react';
import { FoodItem, Species } from '../types';
import { searchFoodCatalog, selectFoodPackage } from '../services/onlineFoodCatalog';
import { ColombiaRegistrySearch } from './ColombiaRegistrySearch';
import { LabelReviewModal } from './LabelReviewModal';
import { FoodLabelComposition } from './FoodLabelComposition';
import { formatCOP } from '../utils/i18n';

interface OnlineFoodSearchProps {
  species: Species;
  foodType?: FoodItem['type'];
  initialQuery?: string;
  lang?: 'es' | 'en';
  category?: 'all' | 'main' | 'snacks';
  onSelect: (food: FoodItem, provenance?: 'label') => void;
}

function packageLabel(size: number): string {
  return size < 1 ? `${Number((size * 1000).toFixed(3))} g` : `${size} kg`;
}

/** Internet searches are intentional submissions; typing never calls the service. */
export function OnlineFoodSearch({ species, foodType, initialQuery = '', lang = 'es', category = 'all', onSelect }: OnlineFoodSearchProps) {
  const isEs = lang === 'es';
  const [query, setQuery] = useState(initialQuery);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState<{food?: FoodItem; formula?:string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    request.current?.abort();
    setFoods([]);
    setUnavailable([]);
    setSearched(false);
    setLoading(false);
    setError('');
    return () => request.current?.abort();
  }, [species, foodType, category]);

  useEffect(() => {
    if (!labelDraft) return;
    const closeLabel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setLabelDraft(null);
    };
    window.addEventListener('keydown', closeLabel, true);
    return () => window.removeEventListener('keydown', closeLabel, true);
  }, [labelDraft]);

  function choose(food: FoodItem) {
    if (food.fichaNutricional?.coincidenciaEstado === 'revision_requerida' ||
        (food.feedingGuide && food.labelStatus === 'unconfirmed')) setLabelDraft({food});
    else onSelect(food);
  }

  async function submit() {
    const text = query.trim();
    request.current?.abort();
    if (text.length < 2 || text.length > 100) {
      setError(isEs ? 'Escribe entre 2 y 100 caracteres.' : 'Enter between 2 and 100 characters.');
      setFoods([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setUnavailable([]);
    setFoods([]);
    setError('');
    setSearched(false);
    try {
      const results = await searchFoodCatalog(text, species, foodType, controller.signal);
      if (controller.signal.aborted) return;
      setUnavailable(results.unavailableSources);
      setFoods(results.foods.filter(food => category === 'all' ||
        (category === 'snacks' ? food.nutritionalUse === 'treat' : food.nutritionalUse !== 'treat')));
      setSearched(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : (isEs ? 'No pudimos consultar internet. Inténtalo de nuevo.' : 'Could not search online. Try again.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#44544A]">
        {isEs ? 'Busca por marca y fórmula en tiendas de Colombia. Cada presentación muestra su precio y los nutrientes publicados.' : 'Search Colombian stores by brand and formula. Each listing shows its package prices and published nutrients.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={isEs ? 'Buscar alimentos en internet' : 'Search foods online'}
          value={query}
          onChange={(event) => {
            request.current?.abort();
            setQuery(event.target.value);
            setFoods([]);
            setError('');
            setUnavailable([]);
            setSearched(false);
            setLoading(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={100}
          placeholder={isEs ? 'Ej. Royal Canin Sterilised 37' : 'E.g. Royal Canin Sterilised 37'}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#0B5D2E30] bg-white px-3 text-sm text-[#1C2B21] focus:outline-none focus:ring-2 focus:ring-[#0B5D2E]"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void submit()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0B5D2E] px-3 text-xs font-bold text-white disabled:opacity-60"
        >
          <Search className="size-4" aria-hidden="true" />
          {isEs ? 'Buscar en internet' : 'Search online'}
        </button>
      </div>
      {query.trim() && (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(`${query.trim()} ${species === 'cat' ? 'gato' : 'perro'} Colombia ficha nutricional presentaciones`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 text-xs text-[#0B5D2E] underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {isEs ? 'Buscar en toda la web' : 'Search the whole web'}
        </a>
      )}
      <div role="region" aria-label={isEs ? 'Resultados de internet' : 'Online results'} aria-busy={loading} className="space-y-3">
        {loading && (
          <p role="status" className="text-xs text-[#44544A]">
            {isEs ? 'Consultando tiendas de Colombia…' : 'Searching Colombian stores…'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{error}</p>
        )}
        {unavailable.length > 0 && <p role="status" className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
          {isEs ? 'Consulta parcial. Fuentes pendientes: ' : 'Partial results. Unavailable sources: '}{unavailable.join(', ')}.
        </p>}
        {searched && foods.length === 0 && (
          <p role="status" className="text-xs text-[#44544A]">
            {isEs ? 'No encontramos esa fórmula para esta especie y tipo en las fuentes consultadas.' : 'The available sources did not return this formula for the selected species and type.'}
          </p>
        )}
        {(searched || error) && <button type="button" onClick={() => setLabelDraft({})}
          className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 text-xs font-bold text-[#0B5D2E]">
          {isEs ? 'Usar la etiqueta de mi alimento' : 'Use my food label'}
        </button>}
        {foods.map((food, index) => {
          const sizes = [...new Set([
            ...(food.availableSizesKg || []),
            ...(food.bagSizeKg ? [food.bagSizeKg] : []),
          ])].filter((size) => Number.isFinite(size) && size > 0).sort((a, b) => a - b);
          const sourceUrl = food.storeProductUrl || food.buyUrl;
          const safeSource = sourceUrl && /^https:\/\//i.test(sourceUrl) ? sourceUrl : undefined;
          const retailer = food.storeName || food.priceBasis?.storeName;
          const title = [food.brand, food.name].filter(Boolean).join(' ');
          const duplicateTitle = foods.slice(0, index).some(other => [other.brand, other.name].filter(Boolean).join(' ') === title);
          const sheetStatus = food.fichaNutricional?.coincidenciaEstado;
          return (
            <article key={food.id} aria-label={duplicateTitle && retailer ? `${title} · ${retailer}` : title} className="space-y-2 rounded-2xl border border-[#0B5D2E20] bg-white p-3 text-xs">
              <div className="flex items-center gap-3">
                {food.imageUrl && (
                  <img src={food.imageUrl} alt={food.name} loading="lazy" className="size-16 shrink-0 rounded-xl bg-white object-contain" />
                )}
                <div>
                  <h4 className="font-heading text-sm font-extrabold text-[#1C2B21]">{food.brand} {food.name}</h4>
                  <p>{food.species === 'dog' ? (isEs ? 'Perro' : 'Dog') : (isEs ? 'Gato' : 'Cat')} · {food.lifeStageKnown === false ? (isEs ? 'Etapa por confirmar' : 'Stage unknown') : ({adult:isEs?'Adulto':'Adult', puppy:isEs?'Cachorro':'Puppy', kitten:isEs?'Gatito':'Kitten', senior:'Sénior', all:isEs?'Todas las etapas':'All stages'})[food.lifeStage]}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#44544A]">
                <span>{isEs ? 'Fuente: ' : 'Source: '}{retailer}</span>
                {safeSource && (
                  <a href={safeSource} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-[#0B5D2E] underline">
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {isEs ? 'Ver producto original' : 'View original product'}
                  </a>
                )}
              </div>
              {sheetStatus === 'verificado' || sheetStatus === 'revision_requerida' ? <div className="space-y-2 rounded-xl bg-[#F5F8F5] p-2.5">
                {sheetStatus === 'revision_requerida' && <p className="font-semibold text-amber-900">{isEs ? 'Datos de la tienda. Confírmalos con tu empaque.' : 'Store information. Confirm against your package.'}</p>}
                <FoodLabelComposition food={food} language={lang} previewPending />
                {!food.fichaNutricional?.kcalPerKg && <p className="text-[#44544A]">{food.feedingGuide
                  ? (isEs ? 'La ficha incluye una tabla de ración por peso.' : 'The product sheet includes a feeding guide by weight.')
                  : (isEs ? 'Faltan las kcal/kg para calcular la porción por energía.' : 'Energy-based portions need the kcal/kg from the package.')}</p>}
              </div> : <p className="text-[#44544A]">{isEs ? 'Composición pendiente. Puedes leer la etiqueta con una foto.' : 'Nutrition pending. You can read the package with a photo.'}</p>}
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const price = food.packagePrices?.find((basis) => basis.packageKg === size);
                  return (
                    <div key={size} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => choose(selectFoodPackage({ ...food, availableSizesKg: sizes }, size))}
                        className="min-h-11 rounded-xl border border-[#0B5D2E40] bg-[#EAF4EC] px-3 font-bold text-[#0B5D2E]"
                      >
                        {isEs ? 'Elegir' : 'Choose'} {packageLabel(size)}
                      </button>
                      <p className="max-w-36 text-[11px] text-[#44544A]">
                        {price ? formatCOP(price.priceCop, true) : (isEs ? 'Precio por confirmar' : 'Price to confirm')}
                      </p>
                    </div>
                  );
                })}
                {sizes.length === 0 && (
                  <button
                    type="button"
                    onClick={() => choose(selectFoodPackage(food))}
                    className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 font-bold text-[#0B5D2E]"
                  >
                    {isEs ? 'Revisar etiqueta · empaque sin dato' : 'Review label · package size unknown'}
                  </button>
                )}
              </div>
              {food.packagePrices?.length ? (
                <p className="text-[11px] text-[#44544A]">
                  {isEs ? 'Precio consultado en la tienda, sin envío. Se conserva el precio del empaque que elijas.' : 'Observed product price, excluding delivery. The chosen package keeps its own price.'}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {(searched || error && query.trim().length >= 2) && <ColombiaRegistrySearch
        key={query} query={query.trim()} species={species} lang={lang}
        onChoose={formula => setLabelDraft({formula})} />}
      {labelDraft && createPortal(
        <LabelReviewModal isOpen pet={{species}} lang={lang}
          mode={labelDraft.food ? 'review' : 'new'} initialFood={labelDraft.food}
          defaultFoodType={foodType} initialFormulaName={labelDraft.formula ?? query.trim()} onClose={() => setLabelDraft(null)}
          onSaveLabel={food => onSelect(food, 'label')} />, document.body)}
    </div>
  );
}
