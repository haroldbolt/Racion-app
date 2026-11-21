export const registryPath = '/api/colombia-food-registry';
export const registryPage = 'https://www.ica.gov.co/areas/pecuaria/servicios/alimentos-para-animales/listado-de-alimentos-para-animales-registrados';
const maxPdfBytes = 8 * 1024 * 1024;

export function registryAttachment(html: string): string | undefined {
  const candidates = new Set<string>();
  for (const [, href, content] of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    // The ICA uses older attachment URLs on the two parentheses surrounding its current link.
    const label = content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (!/[a-záéíóú]/i.test(label)) continue;
    let url: URL;
    try { url = new URL(href.replace(/&amp;/g, '&'), registryPage); } catch { continue; }
    if (url.origin === new URL(registryPage).origin && !url.username && !url.password &&
        /^\/getattachment\/Areas\/Pecuaria\/Servicios\/Alimentos-para-Animales\/LISTADO-DE-ALIMENTOS-PARA-ANIMALES-REGISTRADOS\/[^/]+\.pdf(?:\.aspx)?$/i.test(url.pathname)) candidates.add(url.href);
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

export async function limitedBytes(response: Response, max: number) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > max) throw new Error('ICA unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) { await reader.cancel(); throw new Error('ICA response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) {buffer.set(part, offset); offset += part.length;}
  return buffer;
}

// Cache only the public ICA file under a single key, independent of the user's search.
export async function registryResponse(url: URL, clientSignal: AbortSignal, cache?: Cache): Promise<Response> {
  const cacheKey = new URL(registryPath, url.origin).href;
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;
  try {
    const init = {signal:AbortSignal.any([clientSignal, AbortSignal.timeout(14000)]), redirect:'manual' as const,
      headers:{'User-Agent':'RacionApp/1.0 (+https://racion-app.pages.dev)'}};
    const page = await limitedBytes(await fetch(registryPage, init), 1200000);
    const source = registryAttachment(new TextDecoder().decode(page));
    if (!source) throw new Error('Missing registry link');
    const pdf = await limitedBytes(await fetch(source, init), maxPdfBytes);
    if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') throw new Error('Unexpected registry format');
    const response = new Response(pdf, {headers:{
      'Content-Type':'application/pdf', 'X-ICA-Source':source, 'Cache-Control':'public, max-age=21600',
    }});
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => {});
    return response;
  } catch {
    return Response.json({error:'registry_unavailable'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
