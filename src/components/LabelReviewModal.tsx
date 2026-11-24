import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Trash2, X } from 'lucide-react';
import type {
  FeedingPlan,
  FoodItem,
  MeasurementBasis,
  NutritionDatasheet,
  NutrientQualifier,
  Pet,
} from '../types';
import { declaredIngredients, labelFields, parseLabelValues, type LabelField, type LabelValues } from '../utils/nutritionLabel';
import { getEffectiveNutrientField } from '../utils/mealNutrition';
import { StorageService } from '../utils/storage';
import { getConfirmedPresentations } from '../data/foodPresentations';
import { selectFoodPackage } from '../services/onlineFoodCatalog';

interface LabelReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pick<Pet, 'species'>;
  initialFormulaName?: string;
  initialRegistry?: FoodItem['icaRegistry'];
  plan?: FeedingPlan;
  initialFood?: FoodItem;
  defaultFoodType?: FoodItem['type'];
  mode?: 'review' | 'new';
  onSaveLabel: (updatedFood: FoodItem) => void;
  lang?: 'es' | 'en';
}

const NUTRIENT_FIELDS = [
  { key: 'proteina', es: 'Proteína', en: 'Protein' },
  { key: 'grasa', es: 'Grasa', en: 'Fat' },
  { key: 'fibra', es: 'Fibra cruda', en: 'Crude fiber' },
  { key: 'carbohidratos', es: 'Carbohidratos', en: 'Carbohydrates' },
  { key: 'humedad', es: 'Humedad', en: 'Moisture' },
  { key: 'cenizas', es: 'Cenizas', en: 'Ash' },
] as const;

const packageSource = 'Etiqueta del empaque';
const manufacturerSource = 'Ficha técnica del fabricante';
const inputClass = 'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs text-[#1C2B21]';

function readText(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}

function readDecimal(data: FormData, name: string): number | undefined {
  const text = readText(data, name);
  if (!text) return undefined;
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text) ? Number(text.replace(',', '.')) : NaN;
}

type LabelFormProps = Omit<LabelReviewModalProps, 'isOpen' | 'initialFood'> & {
  currentFood?: FoodItem;
  mixed: boolean;
  component: 'dry' | 'wet';
  onComponentChange: (component: 'dry' | 'wet') => void;
};

const LabelForm: React.FC<LabelFormProps> = ({
  pet,
  plan,
  currentFood,
  defaultFoodType = 'dry',
  initialFormulaName,
  initialRegistry,
  mode = 'review',
  mixed,
  component,
  onComponentChange,
  onClose,
  onSaveLabel,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const registry = currentFood?.icaRegistry ?? initialRegistry;
  const manualIdentity = !currentFood || (currentFood.id.startsWith('custom_') && !currentFood.sourceFoodId);
  const [labelPhotoUrl, setLabelPhotoUrl] = useState(currentFood?.labelPhotoUrl || '');
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  function reviewValue(key: LabelField) {
    return getEffectiveNutrientField(currentFood, key) ??
      (currentFood?.fichaNutricional?.coincidenciaEstado === 'revision_requerida' ? currentFood.fichaNutricional[key] : undefined);
  }

  const labelEnergy = reviewValue('kcalPerKg');
  const startingEnergy = labelEnergy?.baseMedicion === 'tal_como_se_vende' ? labelEnergy.valor : undefined;

  const form = useRef<HTMLFormElement>(null);
  const reader = useRef<AbortController | null>(null);
  const [reading, setReading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [suggestions, setSuggestions] = useState<LabelValues>({});
  const [labelText, setLabelText] = useState('');
  const [suggestedIngredients, setSuggestedIngredients] = useState('');
  const [suggestionSource, setSuggestionSource] = useState<'package' | 'datasheet'>('package');
  const [otherUse, setOtherUse] = useState(currentFood?.nutritionalUse === 'treat' || currentFood?.nutritionalUse === 'complementary' ? currentFood.nutritionalUse : '');
  const [complete, setComplete] = useState(Boolean(currentFood?.isCompleteAndBalanced || currentFood?.nutritionalUse === 'complete'));
  useEffect(() => () => reader.current?.abort(), []);

  function clearPhoto() {
    reader.current?.abort();
    setReading(false);
    setLabelPhotoUrl('');
    setSuggestedIngredients('');
    setPhotoMessage('');
    setSuggestions({});
  }

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearPhoto();
    const controller = new AbortController();
    reader.current = controller;
    setReading(true);
    try {
      const {readReceipt} = await import('../services/receiptReader');
      const result = await readReceipt(file, {
        signal: controller.signal,
        onPreview: (preview) => { if (!controller.signal.aborted) setLabelPhotoUrl(preview); },
      });
      if (controller.signal.aborted) return;
      const found = parseLabelValues(result.text, false);
      setSuggestionSource('package');
      const ingredients = declaredIngredients(result.text) ?? '';
      setSuggestedIngredients(ingredients);
      setSuggestions(found);
      setPhotoMessage((Object.keys(found).length || ingredients)
        ? (isEs ? 'Comprueba estos valores con tu foto antes de usarlos.' : 'Check these values against your photo before using them.')
        : (isEs ? 'No se reconocieron valores con sus unidades. Puedes escribirlos en los campos de abajo.' : 'No values with units were recognized. You can enter them below.'));
    } catch {
      if (!controller.signal.aborted) setPhotoMessage(isEs ? 'No se pudo leer esta etiqueta. Prueba otra foto o ingresa los valores.' : 'Could not read the label. Try a different photo or enter its values.');
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }

  function readPastedLabel() {
    const found = parseLabelValues(labelText, false);
    const ingredients = declaredIngredients(labelText) ?? '';
    setSuggestionSource('datasheet');
    setSuggestions(found);
    setSuggestedIngredients(ingredients);
    setPhotoMessage(Object.keys(found).length || ingredients
      ? (isEs ? 'Comprueba los datos de esta fórmula antes de copiarlos.' : 'Check these formula details before copying them.')
      : (isEs ? 'Faltan valores con unidades. Puedes completarlos a mano.' : 'No values with units found. Enter them below.'));
  }

  function applySuggestedValues() {
    if (!form.current) return;
    const input = (name: string) => form.current?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    for (const field of labelFields) {
      const value = suggestions[field];
      if (!value) continue;
      const target = input(field === 'kcalPerKg' ? 'energy' : field);
      if (target) target.value = String(value.valor);
      if (field !== 'kcalPerKg') {
        input(field + '-qualifier')!.value = value.calificador;
        input(field + '-basis')!.value = value.baseMedicion;
      }
    }
    if (suggestedIngredients) input('ingredients')!.value = suggestedIngredients;
    input('source')!.value = suggestionSource;
    setSuggestedIngredients('');
    setSuggestions({});
    setPhotoMessage(isEs ? 'Revisa los campos y guarda la ficha cuando estén correctos.' : 'Review the fields and save when correct.');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const brand = readText(data, 'brand');
    const name = readText(data, 'formula');
    if (!brand || !name) {
      setError(isEs ? 'Ingresa la marca y el nombre de la fórmula.' : 'Enter the brand and formula name.');
      return;
    }
    const normalizeIdentity = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
    const species = manualIdentity ? (readText(data, 'species') === 'cat' ? 'cat' : 'dog') : currentFood!.species;
    const identityUnchanged = !currentFood || (species === currentFood.species &&
      normalizeIdentity(brand) === normalizeIdentity(currentFood.brand) &&
      normalizeIdentity(name) === normalizeIdentity(currentFood.name)
    );

    const kcal = readDecimal(data, 'energy');
    const bagSizeKg = readDecimal(data, 'bag');
    if (kcal !== undefined && (!Number.isFinite(kcal) || kcal <= 0)) {
      setError(isEs ? 'Ingresa un valor mayor que cero para la energía en kcal/kg.' : 'Enter a value greater than zero for kcal/kg.');
      return;
    }
    if (bagSizeKg !== undefined && (!Number.isFinite(bagSizeKg) || bagSizeKg <= 0)) {
      setError(isEs ? 'El tamaño del empaque debe ser mayor que cero.' : 'Bag weight must be greater than zero.');
      return;
    }

    const kind = readText(data, 'source');
    const source = kind === 'manufacturer' ? manufacturerSource : kind === 'datasheet' ? 'Ficha del producto' : packageSource;
    const sourceLink = readText(data, 'sourceUrl');
    let sourceUrl: string | undefined;
    if (sourceLink) {
      try {
        const url = new URL(sourceLink);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
        sourceUrl = url.href;
      } catch {
        setError(isEs ? 'Revisa que el enlace a la ficha empiece por https://.' : 'Use an HTTPS link to the product sheet.');
        return;
      }
    }
    const ficha: NutritionDatasheet = {
      coincidenciaEstado: 'pendiente',
      fuenteNombre: isEs ? `${source} · ingresada por ti` : 'Label values entered by you',
      fuenteUrl: sourceUrl || (identityUnchanged ? currentFood?.fichaNutricional?.fuenteUrl : undefined),
      fechaConsulta: identityUnchanged ? currentFood?.fichaNutricional?.fechaConsulta : undefined,
    };
    if (kcal !== undefined) {
      ficha.kcalPerKg = { valor: kcal, unidadOriginal: 'kcal/kg', baseMedicion: 'tal_como_se_vende', calificador: 'tipico' };
    }
    for (const { key, es, en } of NUTRIENT_FIELDS) {
      const valor = readDecimal(data, key);
      if (valor === undefined) continue;
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        setError(isEs ? `${es} debe ser un porcentaje entre 0 y 100.` : `${en} must be a percentage between 0 and 100.`);
        return;
      }
      const qualifier = readText(data, `${key}-qualifier`);
      if (qualifier !== 'minimo' && qualifier !== 'maximo' && qualifier !== 'tipico') {
        setError(isEs ? `Escoge cómo se declara ${es.toLowerCase()} en la etiqueta.` : `Choose the label declaration for ${en.toLowerCase()}.`);
        return;
      }
      const basis: MeasurementBasis = readText(data, `${key}-basis`) === 'materia_seca' ? 'materia_seca' : 'tal_como_se_vende';
      ficha[key] = { valor, unidadOriginal: '%', baseMedicion: basis, calificador: qualifier };
    }

    const hasNutrition = kcal !== undefined || NUTRIENT_FIELDS.some(({ key }) => ficha[key] !== undefined);
    if (hasNutrition) ficha.coincidenciaEstado = 'verificado';
    const retainedConflicts: NonNullable<NutritionDatasheet['discrepancies']> = [];
    for (const key of labelFields) {
      const value = ficha[key];
      if (!value) continue;
      const previous = identityUnchanged ? currentFood?.fichaNutricional?.[key] : undefined;
      const unchanged = previous && value.valor === previous.valor && value.calificador === previous.calificador && value.baseMedicion === previous.baseMedicion;
      const checkedAgainstPackage = data.has(key + '-reconciled');
      if (unchanged && !checkedAgainstPackage && previous.declaracionOriginal) value.declaracionOriginal = previous.declaracionOriginal;
      if (unchanged && !checkedAgainstPackage) retainedConflicts.push(...(currentFood?.fichaNutricional?.discrepancies?.filter(item => item.field === key) ?? []));
      value.source = unchanged && !checkedAgainstPackage ? previous.source || {
        name: currentFood!.fichaNutricional!.fuenteNombre || source,
        url: currentFood!.fichaNutricional!.fuenteUrl,
        observedAt: currentFood!.fichaNutricional!.fechaConsulta || new Date().toISOString(),
      } : {name: checkedAgainstPackage ? packageSource : source, url: checkedAgainstPackage ? undefined : sourceUrl, observedAt: new Date().toISOString()};
    }
    if (retainedConflicts.length) ficha.discrepancies = retainedConflicts;

    // Keep required legacy slots as zero when the structured label has no as-sold value.
    function asSold(key: (typeof NUTRIENT_FIELDS)[number]['key']): number | undefined {
      const nutrient = ficha[key];
      return nutrient?.baseMedicion === 'tal_como_se_vende' ? nutrient.valor : undefined;
    }
    const inLibrary = currentFood && StorageService.getCustomFoods().some(({ id }) => id === currentFood.id);
    const selectedType = readText(data, 'foodType');
    const foodType = currentFood?.type ?? (selectedType === 'wet' ? 'wet' : 'dry');
    const hasSameEnergy = identityUnchanged && kcal !== undefined && currentFood?.kcalPerKg === kcal;
    const declaresGrowth = data.has('growth');
    const ingredients = readText(data, 'ingredients');
    const enteredStage = readText(data, 'stage');
    const growthStage = species === 'cat' ? 'kitten' : 'puppy';
    const stage = enteredStage === 'growth' ? growthStage :
      enteredStage === 'adult' || enteredStage === 'senior' || enteredStage === 'all' ? enteredStage : undefined;
    const lifeStage = stage ?? (declaresGrowth ? growthStage : !manualIdentity && identityUnchanged ? currentFood?.lifeStage : undefined);
    const registeredTitle = normalizeIdentity(name).startsWith(normalizeIdentity(brand) + ' ')
      ? name : [brand, name].join(' ');
    const sameRegistryFormula = initialRegistry && species === pet.species &&
      normalizeIdentity(registeredTitle) === normalizeIdentity(initialRegistry.name);
    const updatedFood: FoodItem = {
      manufacturerFormulaName: identityUnchanged ? currentFood?.manufacturerFormulaName : undefined,
      manufacturerFormulaUrl: identityUnchanged ? currentFood?.manufacturerFormulaUrl : undefined,
      manufacturerSizesKg: identityUnchanged ? currentFood?.manufacturerSizesKg : undefined,
      declaredIcaRegistration: identityUnchanged ? currentFood?.declaredIcaRegistration : undefined,
      icaRegistry: currentFood ? (identityUnchanged ? currentFood.icaRegistry : undefined)
        : (sameRegistryFormula ? initialRegistry : undefined),
      id: inLibrary ? currentFood.id : `custom_${crypto.randomUUID()}`,
      sourceFoodId: identityUnchanged ? currentFood?.sourceFoodId ||
        (currentFood?.id.startsWith('online_') ? currentFood.id : undefined) : undefined,
      brand,
      name,
      species,
      lifeStage: lifeStage ?? 'all',
      lifeStageKnown: !!stage || declaresGrowth || (!manualIdentity && identityUnchanged && currentFood?.lifeStageKnown),
      nutritionalUse: complete ? 'complete' : otherUse === 'treat' || otherUse === 'complementary' ? otherUse : undefined,
      ingredientsSummary: identityUnchanged || ingredients !== currentFood?.ingredientsSummary ? ingredients || undefined : undefined,
      feedingGuide: identityUnchanged ? currentFood?.feedingGuide : undefined,
      storeName: identityUnchanged ? currentFood?.storeName : undefined,
      storeProductUrl: identityUnchanged ? currentFood?.storeProductUrl : undefined,
      type: foodType,
      kcalPerKg: kcal ?? 0,
      kcalPerCup: hasSameEnergy ? currentFood?.kcalPerCup : undefined,
      kcalPerCan: hasSameEnergy ? currentFood?.kcalPerCan : undefined,
      proteinPct: asSold('proteina') ?? 0,
      fatPct: asSold('grasa') ?? 0,
      fiberPct: asSold('fibra') ?? 0,
      moisturePct: asSold('humedad') ?? 0,
      ashPct: asSold('cenizas'),
      carbsPct: asSold('carbohidratos'),
      country: currentFood?.country ?? '',
      barcode: identityUnchanged && bagSizeKg === currentFood?.bagSizeKg ? currentFood?.barcode : undefined,
      bagSizeKg,
      availableSizesKg: getConfirmedPresentations({
        id: identityUnchanged ? currentFood?.id : undefined,
        availableSizesKg: identityUnchanged ? getConfirmedPresentations(currentFood) ?? [] : [],
        bagSizeKg,
      }) ?? undefined,
      packagePrices: identityUnchanged ? currentFood?.packagePrices : undefined,
      priceBasis: identityUnchanged && currentFood ? selectFoodPackage(currentFood, bagSizeKg).priceBasis : undefined,
      imageUrl: identityUnchanged ? currentFood?.imageUrl : undefined,
      buyUrl: identityUnchanged && currentFood ? selectFoodPackage(currentFood, bagSizeKg).buyUrl : undefined,
      labelStatus: hasNutrition ? 'user_confirmed_label' : 'unconfirmed',
      labelPhotoUrl: labelPhotoUrl || undefined,
      isCompleteAndBalanced: data.has('complete') || undefined,
      suitableForGrowth: declaresGrowth || undefined,
      kibbleSizeSuitability: identityUnchanged ? currentFood?.kibbleSizeSuitability : undefined,
      dataSource: ficha.fuenteNombre,
      fichaNutricional: ficha,
    };

    try {
      StorageService.addCustomFood(updatedFood);
    } catch {
      setError(isEs ? 'No pudimos guardar la ficha en este navegador.' : 'Could not save the food in this browser.');
      return;
    }
    onSaveLabel(updatedFood);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="nutrition-label-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[#0B5D2E20] bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2 id="nutrition-label-title" className="font-heading text-lg font-extrabold text-[#1C2B21]">
            {mode === 'new' ? (isEs ? 'Agregar alimento' : 'Add food') : (isEs ? 'Revisar etiqueta' : 'Review label')}
          </h2>
          <button type="button" onClick={onClose} aria-label={isEs ? 'Cerrar' : 'Close'} className="flex size-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <X className="size-5" />
          </button>
        </div>

        <form ref={form} onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-5 py-4">
          {registry?.sourceUrl?.startsWith('https://www.ica.gov.co/') && <p className="text-xs text-[#44544A]">
            <a href={registry.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#0B5D2E] underline">ICA {registry.registration}</a>
            {' · '}{registry.name}
          </p>}
          {mixed && (
            <label className="block space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Alimento de la ración mixta' : 'Food in the mixed ration'}</span>
              <select className={inputClass} value={component} onChange={(event) => onComponentChange(event.target.value as 'dry' | 'wet')}>
                <option value="dry">{isEs ? 'Alimento seco' : 'Dry food'}</option>
                <option value="wet">{isEs ? 'Alimento húmedo' : 'Wet food'}</option>
              </select>
            </label>
          )}

          <div className="space-y-2 rounded-2xl bg-[#F8FAF8] p-3 text-xs">
            <input ref={fileInput} type="file" aria-label={isEs ? 'Foto de la etiqueta' : 'Label photo'} accept="image/*" onChange={handlePhoto} className="hidden" />
            <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#EAF4EC] px-3 font-bold text-[#0B5D2E]">
              <Camera className="size-4" /> {isEs ? 'Leer la etiqueta con una foto' : 'Read label from a photo'}
            </button>
            <details>
              <summary className="cursor-pointer py-2 font-bold text-[#0B5D2E]">{isEs ? 'Pegar una ficha o etiqueta' : 'Paste a product sheet or label'}</summary>
              <label className="block py-1">{isEs ? 'Texto de la etiqueta de esta fórmula' : 'Label text for this formula'}
                <textarea value={labelText} maxLength={24000} onChange={event => { setLabelText(event.target.value); setSuggestedIngredients(''); setSuggestions({}); setPhotoMessage(''); }} rows={4} className={inputClass} />
              </label>
              <button type="button" disabled={!labelText.trim() || reading} onClick={readPastedLabel} className="min-h-11 font-bold text-[#0B5D2E] disabled:opacity-50">{isEs ? 'Extraer datos de la ficha' : 'Extract label details'}</button>
            </details>
            {labelPhotoUrl && <div className="relative">
              <img src={labelPhotoUrl} alt={isEs ? 'Etiqueta del alimento' : 'Food label'} className="max-h-44 w-full object-contain" />
              <button type="button" onClick={clearPhoto} aria-label={isEs ? 'Quitar foto' : 'Remove photo'} className="absolute right-1 top-1 rounded-lg bg-white p-2 text-red-700"><Trash2 className="size-4" /></button>
            </div>}
            {reading && <p role="status">{isEs ? 'Leyendo la etiqueta en este dispositivo…' : 'Reading the label on this device…'} <button type="button" className="underline" onClick={clearPhoto}>{isEs ? 'Cancelar' : 'Cancel'}</button></p>}
            {photoMessage && <p role="status">{photoMessage}</p>}
            {(Object.keys(suggestions).length > 0 || suggestedIngredients) && <div className="space-y-2">
              <ul>{labelFields.map(field => {
                const value = suggestions[field];
                if (!value) return null;
                const label = NUTRIENT_FIELDS.find(({key}) => key === field);
                return <li key={field}>{label ? (isEs ? label.es : label.en) : (isEs ? 'Energía' : 'Energy')} · {value.calificador === 'minimo' ? '≥' : value.calificador === 'maximo' ? '≤' : '≈'} {value.valor} {value.unidadOriginal}</li>;
              })}</ul>
              {suggestedIngredients && <p>{isEs ? 'Ingredientes' : 'Ingredients'} · {suggestedIngredients}</p>}
              <button type="button" onClick={applySuggestedValues} className="rounded-lg border border-green-700 p-2 font-bold text-green-800">{isEs ? 'Copiar estos valores a la ficha' : 'Copy these values into the form'}</button>
            </div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Marca' : 'Brand'}</span>
              <input className={inputClass} name="brand" required defaultValue={currentFood?.brand ?? (mixed ? '' : plan?.foodBrand)} />
            </label>
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Nombre de la fórmula' : 'Formula name'}</span>
              <input className={inputClass} name="formula" required defaultValue={currentFood?.name ?? initialFormulaName ?? (mixed ? '' : plan?.foodName)} />
            </label>
            {manualIdentity && <>
              <label className="space-y-1 text-xs font-bold">
                <span>{isEs ? 'Especie indicada en el empaque' : 'Species on the package'}</span>
                <select aria-label={isEs ? 'Especie indicada en el empaque' : 'Species on the package'} name="species" className={inputClass} defaultValue={currentFood?.species ?? pet.species}>
                  <option value="dog">{isEs ? 'Perro' : 'Dog'}</option>
                  <option value="cat">{isEs ? 'Gato' : 'Cat'}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-bold">
                <span>{isEs ? 'Etapa indicada en el empaque' : 'Life stage on the package'}</span>
                <select aria-label={isEs ? 'Etapa indicada en el empaque' : 'Life stage on the package'} name="stage" className={inputClass} defaultValue={
                  !currentFood || currentFood.lifeStageKnown === false ? '' :
                    ['kitten','puppy'].includes(currentFood.lifeStage) ? 'growth' : currentFood.lifeStage
                }>
                  <option value="">{isEs ? 'Sin declarar' : 'Unspecified'}</option>
                  <option value="growth">{isEs ? 'Crecimiento' : 'Growth'}</option>
                  <option value="adult">{isEs ? 'Adulto' : 'Adult'}</option>
                  <option value="senior">{isEs ? 'Sénior' : 'Senior'}</option>
                  <option value="all">{isEs ? 'Todas las etapas' : 'All life stages'}</option>
                </select>
              </label>
            </>}
            {!currentFood && !mixed && (
              <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
                <span>{isEs ? 'Tipo de alimento' : 'Food type'}</span>
                <select name="foodType" className={inputClass} defaultValue={defaultFoodType === 'wet' ? 'wet' : 'dry'}>
                  <option value="dry">{isEs ? 'Seco' : 'Dry'}</option>
                  <option value="wet">{isEs ? 'Húmedo' : 'Wet'}</option>
                </select>
              </label>
            )}
            {mixed && <input type="hidden" name="foodType" value={component} />}
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Energía metabolizable (kcal/kg)' : 'Metabolizable energy (kcal/kg)'}</span>
              <input className={inputClass} name="energy" inputMode="decimal" defaultValue={startingEnergy} />
            </label>
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Tamaño del empaque (kg)' : 'Bag weight (kg)'}</span>
              <input className={inputClass} name="bag" inputMode="decimal" defaultValue={currentFood?.bagSizeKg ?? (mixed ? undefined : plan?.bagWeightKg)} />
            </label>
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Fuente de los datos' : 'Data source'}</span>
              <select className={inputClass} name="source" defaultValue={currentFood?.labelStatus === 'verified_manufacturer' || currentFood?.fichaNutricional?.fuenteNombre?.includes(manufacturerSource) ? 'manufacturer' : 'package'}>
                <option value="package">{isEs ? packageSource : 'Package label'}</option>
                <option value="datasheet">{isEs ? 'Ficha del producto' : 'Product sheet'}</option>
                <option value="manufacturer">{isEs ? manufacturerSource : 'Manufacturer datasheet'}</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs font-bold">
            <span>{isEs ? 'Enlace a la ficha (opcional)' : 'Product sheet link (optional)'}</span>
            <input className={inputClass} type="url" name="sourceUrl" placeholder="https://" />
          </label>
          <label className="block space-y-1 text-xs font-bold">
            <span>{isEs ? 'Ingredientes declarados en la etiqueta' : 'Ingredients listed on the label'}</span>
            <textarea name="ingredients" maxLength={4000} rows={2} className={inputClass} defaultValue={currentFood?.ingredientsSummary ?? ''} />
          </label>
          <fieldset className="space-y-2 rounded-2xl border border-[#0B5D2E20] p-3">
            <legend className="px-1 text-sm font-extrabold text-[#0B5D2E]">{isEs ? 'Composición de la etiqueta' : 'Label composition'}</legend>
            <p className="text-xs text-[#44544A]">
              {isEs ? 'Deja en blanco lo que la etiqueta no indica. Ingresa la energía del alimento tal como se vende.' : 'Leave values off the label blank. Enter the energy for the food as sold.'}
            </p>
            {NUTRIENT_FIELDS.map(({ key, es, en }) => {
              const nutrient = reviewValue(key);
              const name = isEs ? es : en;
              const qualifier: NutrientQualifier | '' = nutrient?.calificador ?? '';
              return (
                <div key={key} className="grid grid-cols-[1fr_1fr_minmax(5.75rem,1.3fr)] items-end gap-1.5">
                  <label className="min-w-0 space-y-1 text-xs font-bold text-[#1C2B21]">
                    <span>{name} (%)</span>
                    <input className={inputClass} name={key} inputMode="decimal" defaultValue={nutrient?.valor} />
                  </label>
                  <select aria-label={isEs ? `Declaración de ${es.toLowerCase()}` : `${en} declaration`} name={`${key}-qualifier`} className={inputClass} defaultValue={qualifier}>
                    <option value="">{isEs ? 'Declaración' : 'Declaration'}</option>
                    <option value="minimo">{isEs ? 'Mínimo' : 'Minimum'}</option>
                    <option value="maximo">{isEs ? 'Máximo' : 'Maximum'}</option>
                    <option value="tipico">{isEs ? 'Típico' : 'Typical'}</option>
                  </select>
                  <select aria-label={isEs ? `Base de ${es.toLowerCase()}` : `${en} basis`} name={`${key}-basis`} className={inputClass} defaultValue={nutrient?.baseMedicion ?? 'tal_como_se_vende'}>
                    <option value="tal_como_se_vende">{isEs ? 'Tal como se vende' : 'As sold'}</option>
                    <option value="materia_seca">{isEs ? 'Materia seca' : 'Dry matter'}</option>
                  </select>
                </div>
              );
            })}
          </fieldset>

          {currentFood?.fichaNutricional?.discrepancies?.map(conflict => {
            const name = NUTRIENT_FIELDS.find(({key}) => key === conflict.field);
            const label = name ? (isEs ? name.es : name.en) : (isEs ? 'Energía' : 'Energy');
            return <label key={conflict.field} className="block rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
              <span className="block">{label} · {isEs ? 'La tienda publica' : 'Store lists'} {conflict.other.calificador === 'minimo' ? '≥' : conflict.other.calificador === 'maximo' ? '≤' : '≈'} {conflict.other.valor} {conflict.other.unidadOriginal}. {isEs ? 'Las fuentes difieren.' : 'Sources differ.'}</span>
              <input type="checkbox" name={conflict.field + '-reconciled'} className="mr-2 mt-2" />
              {isEs ? 'Verifiqué el valor, la base y la declaración en mi empaque.' : 'I checked the value, basis and declaration on my package.'}
            </label>;
          })}

          <div className="space-y-2 rounded-2xl bg-[#F8FAF8] p-3 text-xs text-[#1C2B21]">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="complete" checked={complete} onChange={(event) => {setComplete(event.target.checked); if (event.target.checked) setOtherUse('');}} className="mt-0.5 accent-[#0B5D2E]" />
              <span>{isEs ? 'La etiqueta declara alimento completo y balanceado' : 'Label declares complete and balanced food'}</span>
            </label>
            {!complete && <label className="block">{isEs ? 'Otro uso declarado' : 'Other declared use'}
              <select value={otherUse} onChange={event => setOtherUse(event.target.value)} className={inputClass}>
                <option value="">{isEs ? 'Sin declarar' : 'Undeclared'}</option>
                <option value="complementary">{isEs ? 'Alimento complementario' : 'Complementary food'}</option>
                <option value="treat">{isEs ? 'Premio' : 'Treat'}</option>
              </select>
            </label>}
            <label className="flex items-start gap-2">
              <input type="checkbox" name="growth" defaultChecked={currentFood?.suitableForGrowth} className="mt-0.5 accent-[#0B5D2E]" />
              <span>{isEs ? 'La etiqueta declara apto para crecimiento' : 'Label declares suitability for growth'}</span>
            </label>
          </div>

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <button type="submit" disabled={reading} className="flex disabled:opacity-50 min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 text-sm font-extrabold text-white hover:bg-[#094723]">
            <Check className="size-4" /> {isEs ? 'Guardar ficha' : 'Save food'}
          </button>
        </form>
      </div>
    </div>
  );
};

const LabelReviewDialog: React.FC<LabelReviewModalProps> = ({ initialFood, plan, ...props }) => {
  const [component, setComponent] = useState<'dry' | 'wet'>(plan?.dryFood || !plan?.wetFood ? 'dry' : 'wet');
  const mixed = plan?.foodType === 'mixed' && !initialFood;
  const currentFood = initialFood ?? (mixed
    ? component === 'dry' ? plan?.dryFood : plan?.wetFood
    : plan?.foodType === 'wet' ? plan.wetFood : plan?.dryFood);
  return (
    <LabelForm
      {...props}
      key={mixed ? component : currentFood?.id}
      plan={plan}
      currentFood={currentFood}
      defaultFoodType={props.defaultFoodType ?? (plan?.foodType === 'wet' ? 'wet' : 'dry')}
      mixed={mixed}
      component={component}
      onComponentChange={setComponent}
    />
  );
};

export const LabelReviewModal: React.FC<LabelReviewModalProps> = (props) =>
  props.isOpen ? <LabelReviewDialog {...props} /> : null;
