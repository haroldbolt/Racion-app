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

/** A missing decimal can turn one valid retail size into a different valid size. */
export function reviewReceiptPackage(packageKg: number, selectedKg: number | undefined, knownSizes: readonly number[]) {
  const sameSize = (a: number, b: number) => Math.abs(a - b) <= 0.000001;
  if (!Number.isFinite(packageKg) || packageKg <= 0) return { differsFromKnown: false, smallerSize: undefined };
  const differsFromKnown = knownSizes.length > 0 && !knownSizes.some(size => sameSize(size, packageKg));
  const smallerSize = selectedKg !== undefined && selectedKg > 0 && packageKg >= 10 * selectedKg - 0.000001
    ? selectedKg
    : knownSizes.find(size => size > 0 && sameSize(size * 10, packageKg));
  return { differsFromKnown, smallerSize };
}
