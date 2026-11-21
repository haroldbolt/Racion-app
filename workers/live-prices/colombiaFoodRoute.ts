import { searchColombiaCatalog } from './colombiaCatalog';

export const catalogPath = '/api/colombia-foods';

export async function colombiaFoodResponse(url: URL, signal: AbortSignal, cache?: Cache): Promise<Response> {
  const params = url.searchParams;
  const q = (params.get('q') ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const species = params.get('species');
  const type = params.get('type');
  if (q.length < 2 || q.length > 100 || /[\u0000-\u001f\u007f]/u.test(q) ||
      (species !== 'dog' && species !== 'cat') || (type !== null && type !== 'dry' && type !== 'wet' && type !== 'barf')) {
    return Response.json({error:'invalid_request'}, {status:400});
  }
  const key = new URL(catalogPath, url.origin);
  key.searchParams.set('q', q.toLocaleLowerCase('es-CO'));
  key.searchParams.set('species', species);
  if (type) key.searchParams.set('type', type);
  const cached = await cache?.match(key.href);
  if (cached) return cached;
  try {
    const result = await searchColombiaCatalog(q, species, type || undefined, signal);
    const ttl = result.unavailableSources.length ? 0 : result.foods.length ? 600 : 60;
    const response = Response.json(result, {headers:{'Cache-Control': ttl ? 'public, max-age=' + ttl : 'no-store'}});
    if (cache && ttl) await cache.put(key.href, response.clone()).catch(() => {});
    return response;
  } catch {
    return Response.json({error:'catalog_unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}});
  }
}
