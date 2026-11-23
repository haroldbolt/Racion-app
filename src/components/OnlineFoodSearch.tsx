import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Search } from 'lucide-react';
import { FeedingPlan, FoodItem, Pet, Species } from '../types';
import { searchFoodCatalog } from '../services/onlineFoodCatalog';
import { ColombiaRegistrySearch } from './ColombiaRegistrySearch';
import { LabelReviewModal } from './LabelReviewModal';
import { OnlineFoodCards } from './OnlineFoodCards';
import { StoreManufacturerResults } from './StoreManufacturerResults';
import { enrichMarketFoods } from '../services/onlineFoodResults';

const SearchPriceDialog = lazy(() => import('./SearchPriceDialog').then(module => ({default:module.SearchPriceDialog})));

interface OnlineFoodSearchProps {
  species: Species;
  foodType?: FoodItem['type'];
  initialQuery?: string;
  compareFor?: {pet: Pet; plan?: FeedingPlan};
  lang?: 'es' | 'en';
  category?: 'all' | 'main' | 'snacks';
  onSelect: (food: FoodItem, provenance?: 'label' | 'manufacturer') => void;
}


/** Internet searches are intentional submissions; typing never calls the service. */
export function OnlineFoodSearch({ species, foodType, initialQuery = '', lang = 'es', category = 'all', compareFor, onSelect }: OnlineFoodSearchProps) {
  const isEs = lang === 'es';
  const [query, setQuery] = useState(initialQuery);
  const [comparing, setComparing] = useState<FoodItem>();
  const compare = compareFor ? setComparing : undefined;
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState<{food?: FoodItem; formula?:string; registry?:FoodItem['icaRegistry']} | null>(null);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [submission, setSubmission] = useState<AbortSignal>();
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    request.current?.abort();
    setSubmission(undefined);
    setFoods([]);
    setUnavailable([]);
    setSearched(false);
    setRegistryOpen(false);
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

  function chooseStoreFood(food: FoodItem) {
    if (food.labelStatus === 'verified_manufacturer') onSelect(food, 'manufacturer');
    else choose(food);
  }

  async function submit() {
    const text = query.trim();
    request.current?.abort();
    if (text.length < 2 || text.length > 100) {
      setSubmission(undefined);
      setError(isEs ? 'Escribe entre 2 y 100 caracteres.' : 'Enter between 2 and 100 characters.');
      setFoods([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setSubmission(controller.signal);
    setLoading(true);
    setUnavailable([]);
    setFoods([]);
    setError('');
    setSearched(false);
    setRegistryOpen(false);
    try {
      const results = await searchFoodCatalog(text, species, foodType, controller.signal);
      if (controller.signal.aborted) return;
      const matches = results.foods.filter(food => category === 'all' ||
        (category === 'snacks' ? food.nutritionalUse === 'treat' : food.nutritionalUse !== 'treat'));
      const enriched = await enrichMarketFoods(matches);
      if (controller.signal.aborted) return;
      setUnavailable(results.unavailableSources);
      setFoods(enriched);
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
        {isEs ? 'Busca por marca y fórmula. Al elegir un empaque se cargan los nutrientes publicados de ese alimento.' : 'Search by brand and formula. Choosing a package loads the published nutrients for that food.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={isEs ? 'Buscar alimentos en internet' : 'Search foods online'}
          value={query}
          onChange={(event) => {
            request.current?.abort();
            setSubmission(undefined);
            setQuery(event.target.value);
            setFoods([]);
            setError('');
            setUnavailable([]);
            setSearched(false);
            setRegistryOpen(false);
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
      {submission && !registryOpen && category !== 'snacks' && (!foodType || foodType === 'dry') && (
        <StoreManufacturerResults query={query.trim()} species={species} lang={lang} signal={submission} choose={chooseStoreFood} compare={compare} />
      )}
      {(searched || error && query.trim().length >= 2) && <ColombiaRegistrySearch
        key={query + ':' + species + ':' + foodType + ':' + category} query={query.trim()} species={species} foodType={foodType} category={category} lang={lang}
        onOpenChange={setRegistryOpen} onSelect={choose} compare={compare}
        onManual={(item, sourceUrl) => setLabelDraft({formula:item.name,registry:{registration:item.registration,name:item.name,sourceUrl}})} />}
      <div role="region" aria-label={isEs ? 'Resultados de internet' : 'Online results'} aria-busy={loading} className="space-y-3">
        {loading && (
          <p role="status" className="text-xs text-[#44544A]">
            {isEs ? 'Consultando tiendas de Colombia…' : 'Searching Colombian stores…'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{error}</p>
        )}
        {!registryOpen && unavailable.length > 0 && <p role="status" className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
          {isEs ? 'Consulta parcial. Fuentes pendientes: ' : 'Partial results. Unavailable sources: '}{unavailable.join(', ')}.
        </p>}
        {!registryOpen && searched && foods.length === 0 && (
          <p role="status" className="text-xs text-[#44544A]">
            {isEs ? 'Las otras tiendas consultadas no devolvieron ofertas para esta fórmula.' : 'The other stores returned no listings for this formula.'}
          </p>
        )}
        {(searched || error) && <button type="button" onClick={() => setLabelDraft({})}
          className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 text-xs font-bold text-[#0B5D2E]">
          {isEs ? 'Usar la etiqueta de mi alimento' : 'Use my food label'}
        </button>}
        {!registryOpen && <OnlineFoodCards foods={foods} lang={lang} choose={choose} compare={compare} />}
      </div>
      {compareFor && comparing && <Suspense fallback={<p role="status">{isEs ? 'Abriendo el comparador…' : 'Opening price comparison…'}</p>}>
        <SearchPriceDialog food={comparing} pet={compareFor.pet} plan={compareFor.plan} lang={lang} onClose={() => setComparing(undefined)} />
      </Suspense>}
      {labelDraft && createPortal(
        <LabelReviewModal isOpen pet={{species}} lang={lang}
          mode={labelDraft.food ? 'review' : 'new'} initialFood={labelDraft.food}
          defaultFoodType={foodType} initialFormulaName={labelDraft.formula ?? query.trim()} initialRegistry={labelDraft.registry} onClose={() => setLabelDraft(null)}
          onSaveLabel={food => onSelect(food, 'label')} />, document.body)}
    </div>
  );
}
