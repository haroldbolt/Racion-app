/** Resolves a root-relative public asset without changing external or stored image URLs. */
export function publicAssetUrl(url: string): string {
  const base = import.meta.env.BASE_URL;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith(base)) return url;
  return base + url.slice(1);
}
