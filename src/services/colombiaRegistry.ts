import { getColombiaCatalogUrl } from './onlineFoodCatalog';
import { registryRows, type RegistryFood } from '../utils/colombiaRegistryRows';

export const registryPage = 'https://www.ica.gov.co/areas/pecuaria/servicios/alimentos-para-animales/listado-de-alimentos-para-animales-registrados';
interface Registry { foods: RegistryFood[]; source: string }
let pending: Promise<Registry> | undefined;
let expires = 0;

async function readRegistry(): Promise<Registry> {
  const catalog = getColombiaCatalogUrl();
  if (!catalog) throw new Error('missing_endpoint');
  const url = new URL('colombia-food-registry', new URL(catalog, window.location.origin));
  const [response, pdfjs] = await Promise.all([
    fetch(url, {credentials:'omit',signal:AbortSignal.timeout(20000)}),
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
  if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('registry_unavailable');
  const attached = response.headers.get('X-ICA-Source');
  const source = attached && new URL(attached).origin === 'https://www.ica.gov.co' ? attached : registryPage;
  const asset = (name: string) => new URL(import.meta.env.BASE_URL + 'ocr/' + name, window.location.origin).href;
  pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
  const task = pdfjs.getDocument({ data:new Uint8Array(await response.arrayBuffer()),
    standardFontDataUrl:asset('pdf/standard_fonts/'), wasmUrl:asset('pdf/wasm/'), verbosity:0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error('registry_too_large');
    const unique = new Map<string, RegistryFood>();
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const {items} = await page.getTextContent();
      for (const food of registryRows(items.filter(item => 'str' in item))) unique.set(food.registration, food);
      page.cleanup();
    }
    if (!unique.size) throw new Error('registry_unavailable');
    return { foods:[...unique.values()], source };
  } finally { await task.destroy(); }
}

export function loadColombiaRegistry(): Promise<Registry> {
  if (!pending || Date.now() >= expires) {
    expires = Date.now() + 6 * 3600000;
    pending = readRegistry().catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
