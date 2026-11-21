import { useState } from 'react';
import type { FoodCostEntry, Pet } from '../types';
import { getStockBalances } from '../utils/foodInventory';
import { localDateKey } from '../utils/localDate';
import { StorageService } from '../utils/storage';

export function readPetStock(petId: string) {
  const pets = StorageService.getPets();
  const plans = Object.values(StorageService.getPlans()).filter(plan => pets.some(pet => pet.id === plan.petId));
  return getStockBalances(StorageService.getFoodPurchases(), pets.flatMap(pet => StorageService.getMealHistory(pet.id)),
    plans, localDateKey(), pets.flatMap(pet => StorageService.getTreatHistory(pet.id))).filter(group => group.petIds.includes(petId));
}

export function StockSummary({petId, language}: {petId: string; language: 'es' | 'en'}) {
  const es = language === 'es';
  const pets = StorageService.getPets();
  const balances = readPetStock(petId);
  if (!balances.length) return null;
  return <section aria-label={es ? 'Alimento disponible' : 'Food on hand'} className="space-y-3 rounded-2xl border p-4">
    <h3 className="font-bold">{es ? 'Alimento disponible' : 'Food on hand'}</h3>
    {balances.map(group => <div key={group.key} className="text-sm">
      <p className="font-bold">{group.foodName}</p>
      <p>{group.petIds.map(id => pets.find(pet => pet.id === id)?.name).filter(Boolean).join(' + ')} · {Math.round(group.remainingGrams).toLocaleString(es ? 'es-CO' : 'en')} g</p>
      <p>{group.runsOut ? (es ? 'Reposición estimada · ' : 'Estimated refill · ') + group.runsOut : (es ? 'Falta una ración diaria para estimar la reposición.' : 'A daily portion is needed to estimate a refill.')}</p>
    </div>)}
    <p className="text-xs">{es ? 'Descontamos los gramos servidos que registras desde la apertura, empezando por la compra más antigua. La fecha se estima con las raciones actuales.' : 'Logged servings use the oldest open purchase first. The projected date uses current portions.'}</p>
  </section>;
}

export function OpenPurchase({ purchase, pets, language, onSaved }: {
  purchase: FoodCostEntry; pets: Pet[]; language: 'es' | 'en'; onSaved: () => void;
}) {
  const es = language === 'es';
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  return editing ? <form className="space-y-2 rounded-xl border p-3 text-sm" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const openedOn = String(data.get('openedOn') ?? '');
    if (openedOn < purchase.date || openedOn > localDateKey()) return;
    try {
      StorageService.updateFoodPurchase({ ...purchase, openedOn, sharedWithPetIds: data.getAll('sharing').map(String) });
      setError(false); setEditing(false); onSaved();
    } catch { setError(true); }
  }}>
    <label className="block">{es ? 'Fecha de apertura' : 'Opening date'} <input type="date" name="openedOn" required min={purchase.date} max={localDateKey()} defaultValue={purchase.openedOn || localDateKey()} className="rounded-lg border p-2" /></label>
    {pets.some(pet => pet.id !== purchase.petId) && <fieldset><legend>{es ? 'Otras mascotas que comen de esta compra' : 'Other pets sharing this purchase'}</legend>
      {pets.filter(pet => pet.id !== purchase.petId).map(pet => <label key={pet.id} className="mr-3 inline-flex min-h-10 items-center gap-1">
        <input type="checkbox" name="sharing" value={pet.id} defaultChecked={purchase.sharedWithPetIds?.includes(pet.id)} />{pet.name}</label>)}
    </fieldset>}
    {error && <p role="alert">{es ? 'No se pudo guardar la apertura.' : 'Could not save opening date.'}</p>}
    <button className="min-h-10 rounded-lg bg-[#0B5D2E] px-3 text-white">{es ? 'Guardar apertura' : 'Save opening date'}</button>
    <button type="button" className="ml-2 min-h-10 px-2" onClick={() => setEditing(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
  </form> : <button type="button" className="min-h-10 rounded-lg border px-3 text-xs font-bold" onClick={() => setEditing(true)}>
    {purchase.openedOn ? (es ? 'Apertura y mascotas · ' : 'Opening and pets · ') + purchase.openedOn : (es ? 'Registrar apertura de esta compra' : 'Open this purchase')}
  </button>;
}
