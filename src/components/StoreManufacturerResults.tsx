import { useEffect, useState } from 'react';
import type { FoodItem, Species } from '../types';
import {
  getStoreSheetCoverage,
  searchStoreManufacturerFoods,
  selectStoreManufacturerFood,
  type StoreManufacturerFood,
} from '../services/storeManufacturerCatalog';
import { publicAssetUrl } from '../utils/publicAssetUrl';
import { FoodLabelComposition } from './FoodLabelComposition';

interface Props {
  query: string;
  signal: AbortSignal;
  species: Species;
  lang: 'es' | 'en';
  choose: (food: FoodItem) => void;
}

function packageLabel(kg: number) {
  return kg < 1 ? Math.round(kg * 1000) + ' g' : kg + ' kg';
}

export function StoreManufacturerResults({ query, signal, species, lang, choose }: Props) {
  const es = lang === 'es';
  const [matches, setMatches] = useState<StoreManufacturerFood[]>();
  const [coverage, setCoverage] = useState<Awaited<ReturnType<typeof getStoreSheetCoverage>>>();
  const [failed, setFailed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);
  useEffect(() => {
    let current = true;
    setFailed(false);
    setMatches(undefined);
    setVisibleCount(3);
    Promise.all([searchStoreManufacturerFoods(query, species), getStoreSheetCoverage()]).then(
      ([rows, counts]) => {
        if (current && !signal.aborted) {
          setMatches(rows);
          setCoverage(counts);
        }
      },
      () => { if (current && !signal.aborted) setFailed(true); },
    );
    return () => { current = false; };
  }, [query, signal, species]);

  const title = es ? 'Alimentos de Agrocentro Pets' : 'Agrocentro Pets foods';
  if (matches?.length === 0) return null;
  return <section aria-label={title} className="space-y-2 text-xs">
    <h3 className="font-heading text-base font-extrabold text-[#1C2B21]">{title}</h3>
    {!matches && <p role="status" className="text-[#44544A]">{failed
      ? (es ? 'No se pudo cargar el catálogo de Agrocentro Pets.' : 'The Agrocentro Pets catalog could not be loaded.')
      : (es ? 'Buscando en Agrocentro Pets…' : 'Searching Agrocentro Pets…')}</p>}
    {matches?.slice(0, visibleCount).map(item => {
      const food = selectStoreManufacturerFood(item);
      const sizes = item.packagesKg;
      return <article key={item.handle} aria-label={item.name} className="space-y-2 rounded-2xl border border-[#0B5D2E30] bg-white p-3">
        <h4 className="font-heading text-sm font-extrabold text-[#1C2B21]">{item.name}</h4>
        <div className="flex flex-wrap items-center gap-x-4 text-[#0B5D2E]">
          {item.officialUrl
            ? <a href={item.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center font-bold underline">{es ? 'Ficha oficial' : 'Official product sheet'}</a>
            : <a href={item.houseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center underline">{es ? 'Casa comercial' : 'Brand website'}</a>}
          <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center underline">{es ? 'Ver en Agrocentro Pets' : 'View at Agrocentro Pets'}</a>
        </div>
        {item.officialUrl
          ? <FoodLabelComposition food={food} language={lang} />
          : <p className="text-[#44544A]">{es ? 'Ficha oficial pendiente. Puedes completar los nutrientes con tu etiqueta.' : 'Official sheet pending. You can enter the nutrients from your package.'}</p>}
        {sizes.length > 0
          ? <div className="flex flex-wrap gap-2">
            {sizes.map(size => {
              const fromBrand = item.officialPackagesKg?.includes(size);
              const fromStore = item.storePackagesKg.includes(size);
              const source = fromBrand && fromStore ? (es ? 'Ficha y tienda' : 'Sheet and store')
                : fromBrand ? (es ? 'Ficha oficial' : 'Product sheet') : (es ? 'Tienda' : 'Store');
              return <div key={size} className="text-center">
                <button type="button" onClick={() => choose(selectStoreManufacturerFood(item, size))}
                  className="min-h-11 rounded-xl border border-[#0B5D2E40] bg-[#EAF4EC] px-3 font-bold text-[#0B5D2E]">
                  {es ? 'Elegir' : 'Choose'} {packageLabel(size)}
                </button>
                <p className="mt-1 text-[11px] text-[#44544A]">
                  {item.formula?.packageSources?.[String(size)]
                    ? <a href={item.formula.packageSources[String(size)]} target="_blank" rel="noopener noreferrer" className="underline">{source}</a>
                    : source}
                </p>
              </div>;
            })}
          </div>
          : <button type="button" onClick={() => choose(food)} className="min-h-11 rounded-xl border border-[#0B5D2E40] px-3 font-bold text-[#0B5D2E]">
            {es ? 'Elegir sin presentación' : 'Choose without package size'}
          </button>}
      </article>;
    })}
    {matches && visibleCount < matches.length && <button type="button" onClick={() => setVisibleCount(count => count + 5)}
      className="min-h-11 font-bold text-[#0B5D2E] underline">{es ? 'Ver más de Agrocentro Pets' : 'More from Agrocentro Pets'} ({matches.length - visibleCount})</button>}
    {matches && coverage && <details className="text-[#44544A]">
      <summary className="cursor-pointer py-2 font-semibold">{es ? 'Cobertura de las fichas de la tienda' : 'Store product sheet coverage'}</summary>
      <p>{es
        ? `${coverage.total} referencias de la tienda: ${coverage.complete} completas, ${coverage.partial} parciales y ${coverage.pending} pendientes.`
        : `${coverage.total} store listings: ${coverage.complete} complete, ${coverage.partial} partial and ${coverage.pending} pending.`}</p>
      <p>{es ? 'Una ficha completa incluye proteína, grasa, fibra, kcal/kg y al menos un tamaño de empaque identificado en la ficha o en la tienda.'
        : 'A complete sheet includes protein, fat, fiber, kcal/kg and at least one package size documented by the brand or the store.'}</p>
      <a className="inline-flex min-h-9 items-center font-semibold text-[#0B5D2E] underline"
        href={publicAssetUrl('/auditorias/fichas-2026-11-22.html')} target="_blank" rel="noopener noreferrer">
        {es ? 'Ver la revisión de 274 fichas del 22 de noviembre de 2026' : 'View the 274 listings reviewed on November 22, 2026'}
      </a>
    </details>}
  </section>;
}
