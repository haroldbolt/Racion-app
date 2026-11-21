import React, { useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Trash2, X } from 'lucide-react';
import type {
  FeedingPlan,
  FoodItem,
  MeasurementBasis,
  NutritionDatasheet,
  NutrientQualifier,
  Pet,
} from '../types';
import { getEffectiveNutrientField } from '../utils/mealNutrition';
import { StorageService } from '../utils/storage';
import { getConfirmedPresentations } from '../data/foodPresentations';

interface LabelReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
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
  mode = 'review',
  mixed,
  component,
  onComponentChange,
  onClose,
  onSaveLabel,
  lang = 'es',
}) => {
  const isEs = lang === 'es';
  const [labelPhotoUrl, setLabelPhotoUrl] = useState(currentFood?.labelPhotoUrl || '');
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const labelEnergy = getEffectiveNutrientField(currentFood, 'kcalPerKg');
  const startingEnergy = labelEnergy?.baseMedicion === 'tal_como_se_vende' ? labelEnergy.valor : undefined;

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 960 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          setLabelPhotoUrl(canvas.toDataURL('image/jpeg', 0.82));
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
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

    const source = readText(data, 'source') === 'manufacturer' ? manufacturerSource : packageSource;
    const ficha: NutritionDatasheet = {
      coincidenciaEstado: 'pendiente',
      fuenteNombre: isEs ? `${source} · ingresada por ti` : 'Label values entered by you',
      fuenteUrl: currentFood?.fichaNutricional?.fuenteUrl,
      fechaConsulta: currentFood?.fichaNutricional?.fechaConsulta,
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

    // Keep required legacy slots as zero when the structured label has no as-sold value.
    function asSold(key: (typeof NUTRIENT_FIELDS)[number]['key']): number | undefined {
      const nutrient = ficha[key];
      return nutrient?.baseMedicion === 'tal_como_se_vende' ? nutrient.valor : undefined;
    }
    const inLibrary = currentFood && StorageService.getCustomFoods().some(({ id }) => id === currentFood.id);
    const selectedType = readText(data, 'foodType');
    const foodType = currentFood?.type ?? (selectedType === 'wet' ? 'wet' : 'dry');
    const hasSameEnergy = kcal !== undefined && currentFood?.kcalPerKg === kcal;
    const declaresGrowth = data.has('growth');
    const updatedFood: FoodItem = {
      id: inLibrary ? currentFood.id : `custom_${crypto.randomUUID()}`,
      brand,
      name,
      species: currentFood?.species ?? pet.species,
      lifeStage: declaresGrowth ? (pet.species === 'cat' ? 'kitten' : 'puppy') : currentFood?.lifeStage ?? 'all',
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
      barcode: bagSizeKg === currentFood?.bagSizeKg ? currentFood?.barcode : undefined,
      bagSizeKg,
      availableSizesKg: getConfirmedPresentations({
        id: currentFood?.id,
        availableSizesKg: getConfirmedPresentations(currentFood) ?? [],
        bagSizeKg,
      }) ?? undefined,
      imageUrl: currentFood?.imageUrl,
      buyUrl: currentFood?.buyUrl,
      labelStatus: hasNutrition ? 'user_confirmed_label' : 'unconfirmed',
      labelPhotoUrl: labelPhotoUrl || undefined,
      isCompleteAndBalanced: data.has('complete') || undefined,
      suitableForGrowth: declaresGrowth || undefined,
      kibbleSizeSuitability: currentFood?.kibbleSizeSuitability,
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

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-5 py-4">
          {mixed && (
            <label className="block space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Alimento de la ración mixta' : 'Food in the mixed ration'}</span>
              <select className={inputClass} value={component} onChange={(event) => onComponentChange(event.target.value as 'dry' | 'wet')}>
                <option value="dry">{isEs ? 'Alimento seco' : 'Dry food'}</option>
                <option value="wet">{isEs ? 'Alimento húmedo' : 'Wet food'}</option>
              </select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Marca' : 'Brand'}</span>
              <input className={inputClass} name="brand" required defaultValue={currentFood?.brand ?? (mixed ? '' : plan?.foodBrand)} />
            </label>
            <label className="space-y-1 text-xs font-bold text-[#1C2B21]">
              <span>{isEs ? 'Nombre de la fórmula' : 'Formula name'}</span>
              <input className={inputClass} name="formula" required defaultValue={currentFood?.name ?? (mixed ? '' : plan?.foodName)} />
            </label>
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
                <option value="manufacturer">{isEs ? manufacturerSource : 'Manufacturer datasheet'}</option>
              </select>
            </label>
          </div>

          <fieldset className="space-y-2 rounded-2xl border border-[#0B5D2E20] p-3">
            <legend className="px-1 text-sm font-extrabold text-[#0B5D2E]">{isEs ? 'Composición de la etiqueta' : 'Label composition'}</legend>
            <p className="text-xs text-[#44544A]">
              {isEs ? 'Deja en blanco lo que la etiqueta no indica. Ingresa la energía del alimento tal como se vende.' : 'Leave values off the label blank. Enter the energy for the food as sold.'}
            </p>
            {NUTRIENT_FIELDS.map(({ key, es, en }) => {
              const nutrient = getEffectiveNutrientField(currentFood, key);
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

          <div className="space-y-2 rounded-2xl bg-[#F8FAF8] p-3 text-xs text-[#1C2B21]">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="complete" defaultChecked={currentFood?.isCompleteAndBalanced} className="mt-0.5 accent-[#0B5D2E]" />
              <span>{isEs ? 'La etiqueta declara alimento completo y balanceado' : 'Label declares complete and balanced food'}</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="growth" defaultChecked={currentFood?.suitableForGrowth} className="mt-0.5 accent-[#0B5D2E]" />
              <span>{isEs ? 'La etiqueta declara apto para crecimiento' : 'Label declares suitability for growth'}</span>
            </label>
          </div>

          <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
          {labelPhotoUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-gray-200">
              <img src={labelPhotoUrl} alt={isEs ? 'Etiqueta del alimento' : 'Food label'} className="max-h-44 w-full object-contain" />
              <button type="button" onClick={() => setLabelPhotoUrl('')} aria-label={isEs ? 'Quitar foto' : 'Remove photo'} className="absolute right-2 top-2 rounded-xl bg-white p-2 text-red-600">
                <Trash2 className="size-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#EAF4EC] px-3 text-xs font-bold text-[#0B5D2E]">
              <Camera className="size-4" />
              {isEs ? 'Adjuntar foto de la etiqueta (opcional)' : 'Attach label photo (optional)'}
            </button>
          )}

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <button type="submit" className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 text-sm font-extrabold text-white hover:bg-[#094723]">
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
