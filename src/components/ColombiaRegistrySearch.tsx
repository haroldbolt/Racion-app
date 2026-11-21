import { useEffect, useRef, useState } from 'react';
import type { FoodItem, Species } from '../types';
import { loadColombiaRegistry, registryPage } from '../services/colombiaRegistry';
import type { FoodCatalogResult } from '../services/onlineFoodCatalog';
import { registryFormulaKey, searchRegistryMarket } from '../services/registryMarket';
import { findRegistrations, type RegistryFood } from '../utils/colombiaRegistryRows';
import { OnlineFoodCards } from './OnlineFoodCards';

type Registry = Awaited<ReturnType<typeof loadColombiaRegistry>>;
interface Props {
  query: string;
  species: Species;
  foodType?: FoodItem['type'];
  category: 'all' | 'main' | 'snacks';
  lang: 'es' | 'en';
  onOpenChange: (open: boolean) => void;
  onManual: (record: RegistryFood, sourceUrl: string) => void;
  onSelect: (food: FoodItem) => void;
}

export function ColombiaRegistrySearch({query, species, foodType, category, lang, onOpenChange, onManual, onSelect}: Props) {
  const es = lang === 'es';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registry, setRegistry] = useState<Registry>();
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(8);
  const [selected, setSelected] = useState<RegistryFood>();
  const [market, setMarket] = useState<FoodCatalogResult>();
  const [marketError, setMarketError] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);

  function beginRequest() {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return controller.signal;
  }

  async function loadOffers(item: RegistryFood, index: Registry) {
    const signal = beginRequest();
    setSelected(item);
    setMarket(undefined);
    setMarketError(false);
    const identity = registryFormulaKey(item.name);
    const ambiguous = index.foods.some(other => other[species] && other.registration !== item.registration && registryFormulaKey(other.name) === identity);
    try {
      const found = await searchRegistryMarket(item, species, foodType, index.source, signal, ambiguous);
      if (signal.aborted) return;
      const foods = found.foods.filter(food => category === 'all' || (category === 'snacks' ? food.nutritionalUse === 'treat' : food.nutritionalUse !== 'treat'));
      setMarket({...found, foods});
    } catch {
      if (!signal.aborted) setMarketError(true);
    }
  }

  async function lookup() {
    const signal = beginRequest();
    setOpen(true); onOpenChange(true); setLoading(true); setError(false);
    setMarket(undefined); setSelected(undefined); setMarketError(false);
    try {
      const index = await loadColombiaRegistry();
      if (signal.aborted) return;
      setRegistry(index);
      setLoading(false);
      const found = findRegistrations(index.foods, query, species);
      if (found.length === 1) void loadOffers(found[0], index);
    } catch {
      if (!signal.aborted) {setError(true); setLoading(false);}
    }
  }

  function close() {
    current.current?.abort();
    setOpen(false); onOpenChange(false); setLimit(8);
  }
  const matches = open && registry && !error ? findRegistrations(registry.foods, query, species) : [];
  return <section aria-label={es ? 'Registro colombiano de alimentos' : 'Colombian food registry'} className="space-y-2 text-xs">
    <button type="button" disabled={loading} aria-expanded={open} onClick={open && !error ? close : lookup}
      className="min-h-11 font-bold text-[#0B5D2E] underline">
      {loading ? (es ? 'Consultando el ICA…' : 'Checking ICA…') : open && !error ? (es ? 'Ocultar registro ICA' : 'Hide ICA results') :
        (es ? 'Buscar también en el registro del ICA' : 'Also search the ICA registry')}
    </button>
    {open && !loading && <div className="space-y-2 rounded-xl border p-3">
      <p role="status">{error ? (es ? 'El listado del ICA está temporalmente fuera de alcance. Puedes abrir la fuente o ingresar la etiqueta.' : 'ICA registry unavailable. Open the source or enter the label.') :
        matches.length === 1 ? (es ? '1 registro para esta especie.' : '1 record for this species.') :
        matches.length ? (es ? matches.length + ' registros. Elige la fórmula del empaque para consultar sus datos.' : matches.length + ' records. Choose your exact formula to find its details.') :
        (es ? 'Sin coincidencias en este listado para la especie elegida.' : 'No matches in this list for the selected species.')}</p>
      {matches.slice(0,limit).map(item => <div key={item.registration} className="space-y-1 rounded-xl bg-[#F5F9F6] p-2">
        <p className="font-bold">{item.name}</p>
        <p>ICA {item.registration} · {item.category}</p>
        {selected?.registration !== item.registration ?
          <button type="button" onClick={() => void loadOffers(item,registry!)} className="min-h-11 font-bold text-[#0B5D2E]">
            {es ? 'Buscar nutrientes y precios' : 'Find nutrients and prices'}
          </button> :
          <section aria-label={(es ? 'Ofertas y nutrientes del registro ICA ' : 'Offers and nutrients for ICA ') + item.registration} className="space-y-2">
            {!market && !marketError && <p role="status">{es ? 'Buscando presentaciones, nutrientes y precios de esta fórmula…' : 'Finding packages, nutrients and prices for this formula…'}</p>}
            {market?.unavailableSources.length ? <p role="status" className="text-amber-900">{es ? 'Consulta parcial · ' : 'Partial results · '}{market.unavailableSources.join(', ')}</p> : null}
            {marketError || (market && market.foods.length === 0) ? <p role="status">{es ? 'No se pudo vincular una ficha u oferta de esta fórmula. Puedes completar su etiqueta.' : 'No product sheet or offer matched this formula. You can enter its label.'}</p> : null}
            {market && <OnlineFoodCards foods={market.foods} lang={lang} choose={onSelect} />}
            {(marketError || market?.unavailableSources.length) ? <button type="button" onClick={() => void loadOffers(item,registry!)} className="min-h-10 font-bold text-[#0B5D2E]">{es ? 'Reintentar búsqueda' : 'Retry search'}</button> : null}
          </section>}
        <button type="button" onClick={() => onManual(item,registry!.source)} className="min-h-10 text-[#0B5D2E] underline">{es ? 'Completar etiqueta' : 'Add label details'}</button>
      </div>)}
      {matches.length > limit && <button type="button" onClick={() => setLimit(n=>n+8)} className="min-h-10 font-bold">{es ? 'Ver más registros' : 'More records'}</button>}
      <a href={registry?.source ?? registryPage} target="_blank" rel="noopener noreferrer" className="block text-[#0B5D2E] underline">{es ? 'Ver el listado oficial del ICA' : 'View the official ICA list'}</a>
    </div>}
  </section>;
}
