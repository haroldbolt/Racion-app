import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { FeedingPlan, FoodItem, Pet } from '../types';
import { PriceComparisonView } from '../views/PriceComparisonView';

interface Props {
  food: FoodItem;
  pet: Pet;
  plan?: FeedingPlan;
  lang: 'es' | 'en';
  onClose: () => void;
}

export function SearchPriceDialog({food, pet, plan, lang, onClose}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-label={lang === 'es' ? 'Comparar precios' : 'Compare prices'}
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-lg overflow-y-auto rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] shadow-xl backdrop:bg-black/60">
      <PriceComparisonView food={food} pet={pet} plan={plan} language={lang} backTo="search" onBack={onClose} />
    </dialog>,
    document.body,
  );
}
