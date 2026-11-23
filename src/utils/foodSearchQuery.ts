// A package is compared separately. Numbers in the formula name (e.g. Sterilised 37) are significant.
export function foodFormulaQuery(query: string): string {
  return query.trim().replace(/^rc\b/i, 'Royal Canin').replace(/^ppp\b/i, 'Purina Pro Plan')
    .replace(/\b(?:de\s+)?\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|lb|lbs|oz)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
