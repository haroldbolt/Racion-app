import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function buildAgrocentroPriceIndex() {
  const data = new URL('../src/data/manufacturers/', import.meta.url);
  const readJson = async name => JSON.parse(await readFile(new URL(name + '.json', data), 'utf8'));
  const [store, ...groups] = await Promise.all(['store', 'colombia', 'internacional', 'otras', 'especialidades'].map(readJson));
  const formulas = new Map();
  for (const formula of groups.flat()) {
    for (const handle of formula.handles) formulas.set(handle, formula);
  }
  return store.map(row => {
    const formula = formulas.get(row.handle);
    return [row.brand, row.species, row.handle, row.name, formula?.species === row.species ? formula.name : ''];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await buildAgrocentroPriceIndex();
  const destination = new URL('../workers/live-prices/agrocentroIndex.json', import.meta.url);
  await writeFile(destination, '[\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n');
}
