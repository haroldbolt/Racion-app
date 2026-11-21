// ICA's text-layer table reads down a rotated page. Each registration begins a
// record, including wrapped product names and species. Verify the header positions
// before using the column boundaries, so a changed layout cannot misassign data.
interface PdfWord {str: string; transform: number[]}
export interface RegistryFood {
  registration: string;
  name: string;
  category: string;
  dog: boolean;
  cat: boolean;
}

export function registryRows(words: PdfWord[]): RegistryFood[] {
  const headerAt = (heading: string, at: number) => words.some(word =>
    word.str.trim() === heading && Math.abs(word.transform[5] - at) < 2 && word.transform[4] < 61);
  if (!headerAt('Registro ICA', 53) || !headerAt('Nombre producto', 123) ||
      !headerAt('Tipo producto', 229) || !headerAt('Especies', 639)) throw new Error('registry_layout_changed');

  const rows: RegistryFood[] = [];
  let registration = '', name: string[] = [], category: string[] = [], species: string[] = [];
  function finishRow() {
    const targets = species.join(' ').toLowerCase();
    const dog = /\b(caninos?|perros?)\b/.test(targets);
    const cat = /\b(felinos?|gatos?)\b/.test(targets);
    const title = name.join(' ').replace(/\s+/g, ' ').trim();
    const kind = category.join(' ').trim();
    if ((dog || cat) && title && registration && /^(Alimentos completos o balanceados|Suplementos alimenticios)$/i.test(kind)) {
      rows.push({registration, name:title, category:kind, dog, cat});
    }
  }
  for (const word of words) {
    const value = word.str.trim(), across = word.transform[5];
    if (!value || word.transform[4] < 61) continue;
    if (across >= 50 && across < 75) {
      finishRow();
      registration = /^\d{3,8}\s*(AL|SL)$/i.test(value) ? value.replace(/\s+/g, '').toUpperCase() : '';
      name = []; category = []; species = [];
    } else if (registration && across >= 77 && across < 196) name.push(value);
    else if (registration && across >= 198 && across < 283) category.push(value);
    else if (registration && across >= 623 && across < 669) species.push(value);
  }
  finishRow();
  return rows;
}

export function findRegistrations(foods: RegistryFood[], query: string, species: 'dog' | 'cat') {
  const norm = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return foods.filter(food => {
    const text = norm(food.name) + ' ' + food.registration.toLowerCase();
    return food[species] && words.every(word => text.includes(word));
  }).sort((a,b) => a.name.localeCompare(b.name,'es') || a.registration.localeCompare(b.registration));
}
