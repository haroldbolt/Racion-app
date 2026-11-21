/** Accepts an amount in COP with Colombian grouping or an unambiguous decimal part. */
export function parsePurchasedPriceCop(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== 'string') return undefined;
  const entered = value.trim();
  let normalized: string;

  if (/^\d+$/.test(entered)) {
    normalized = entered;
  } else if (/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/.test(entered)) {
    normalized = entered.replace(/\./g, '').replace(',', '.');
  } else if (/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?$/.test(entered)) {
    normalized = entered.replace(/,/g, '');
  } else if (/^\d+[.,]\d{1,2}$/.test(entered)) {
    normalized = entered.replace(',', '.');
  } else {
    return undefined;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER / 100
    ? amount
    : undefined;
}
