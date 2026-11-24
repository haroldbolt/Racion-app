import { ExternalLink } from 'lucide-react';
import type { FoodItem } from '../types';
import { selectFoodPackage } from '../services/onlineFoodCatalog';
import { FoodLabelComposition } from './FoodLabelComposition';
import { formatCOP } from '../utils/i18n';
import { distinctPackageSizes, packageConfirmation, packageLabel } from '../data/foodPresentations';

interface Props {foods: FoodItem[]; lang: 'es' | 'en'; choose: (food: FoodItem) => void; compare?: (food: FoodItem) => void}

export function OnlineFoodCards({foods, lang, choose, compare}: Props) {
  const isEs = lang === 'es';
  return <>
    {foods.map((food, index) => {
      const sizes = distinctPackageSizes([
        ...(food.availableSizesKg || []),
        ...(food.bagSizeKg ? [food.bagSizeKg] : []),
      ]);
      const sourceUrl = food.storeProductUrl || food.buyUrl || food.fichaNutricional?.fuenteUrl;
      const safeSource = sourceUrl && /^https:\/\//i.test(sourceUrl) ? sourceUrl : undefined;
      const retailer = food.storeName || food.priceBasis?.storeName || food.fichaNutricional?.fuenteNombre;
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
              const selected = selectFoodPackage({ ...food, availableSizesKg: sizes }, size);
              const price = food.packagePrices?.find((basis) => basis.packageKg === size);
              return (
                <div key={size} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => choose(selected)}
                    className="min-h-11 rounded-xl border border-[#0B5D2E40] bg-[#EAF4EC] px-3 font-bold text-[#0B5D2E]"
                  >
                    {isEs ? 'Elegir' : 'Choose'} {packageLabel(size)}
                  </button>
                  <p className="max-w-36 text-[11px] text-[#44544A]">{packageConfirmation(food.manufacturerSizesKg, size, isEs)}</p>
                  {compare && food.type !== 'barf' && !food.kcalPerPiece && <button type="button"
                    onClick={() => compare(selected)}
                    className="block min-h-11 rounded-lg px-2 font-bold text-[#0B5D2E] underline">
                    {isEs ? `Comparar ${packageLabel(size)} con envío` : `Compare ${packageLabel(size)} with delivery`}
                  </button>}
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
  </>;
}
