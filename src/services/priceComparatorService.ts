import { PriceComparisonResult, PriceComparatorConfigStatus } from '../types';

export class PriceComparatorService {
  /**
   * Get provider configuration status and information
   */
  public static async getStatus(): Promise<PriceComparatorConfigStatus> {
    try {
      const res = await fetch('/api/price-comparator/status');
      if (!res.ok) throw new Error('Failed to fetch comparator status');
      return await res.json();
    } catch (e) {
      return {
        configured: false,
        provider: 'unconfigured',
        providerName: 'Google Shopping / SerpApi',
        currency: 'COP',
        hasKey: false,
        providerDetails: {
          name: 'SerpApi (Google Shopping API Colombia)',
          description: 'Proveedor autorizado para consultar el índice de Google Shopping en Colombia.',
          cost: '100 búsquedas gratuitas/mes, planes desde $50 USD/mes.',
          limits: '10-20 req/s.',
          updateFrequency: 'En tiempo real.',
          setupGuide: 'Registra tu clave en SerpApi o define SERPAPI_API_KEY.',
        },
      };
    }
  }

  /**
   * Search prices across Google Shopping Colombia
   */
  public static async searchPrices(params: {
    productName: string;
    brand: string;
    presentationWeightKg: number;
    presentationUnit?: 'kg' | 'lb' | 'g';
    city?: string;
    species?: 'dog' | 'cat';
  }): Promise<PriceComparisonResult> {
    const res = await fetch('/api/price-comparator/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al consultar ofertas en Google Shopping');
    }

    return await res.json();
  }

  /**
   * Discovers products, verified presentations, and packshots live from the internet (Google Shopping Colombia).
   */
  public static async discoverProducts(params: {
    query: string;
    city?: string;
    species?: 'dog' | 'cat';
  }): Promise<Array<{
    id: string;
    brand: string;
    productName: string;
    fullName: string;
    species: 'dog' | 'cat';
    imageUrl?: string;
    confirmedSizesKg: number[];
    samplePriceCop?: number;
    stores: string[];
    source: 'internet_google_shopping';
  }>> {
    try {
      const res = await fetch('/api/price-comparator/discover-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.products) ? data.products : [];
    } catch (err) {
      console.warn('PriceComparatorService.discoverProducts error:', err);
      return [];
    }
  }

  /**
   * Automatically fetches live presentations available on the internet (Google Shopping Colombia)
   * for a specific pet food.
   */
  public static async getLivePresentations(params: {
    brand: string;
    productName: string;
    city?: string;
  }): Promise<{
    sizesKg: number[];
    imageUrl?: string;
    source: 'internet_live' | 'cache' | 'fallback';
    count: number;
    detectedStores: string[];
  }> {
    try {
      const res = await fetch('/api/price-comparator/product-presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return { sizesKg: [], source: 'fallback', count: 0, detectedStores: [] };
      return await res.json();
    } catch (err) {
      console.warn('PriceComparatorService.getLivePresentations error:', err);
      return { sizesKg: [], source: 'fallback', count: 0, detectedStores: [] };
    }
  }

  /**
   * Verify offer prior to opening store link
   */
  public static async verifyOffer(offerUrl: string): Promise<{ valid: boolean; checkedAt: string; notice?: string }> {
    try {
      const res = await fetch('/api/price-comparator/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerUrl }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
    return {
      valid: true,
      checkedAt: new Date().toISOString(),
      notice: 'Redirigiendo a la tienda oficial...',
    };
  }

  /**
   * Configure custom API key on server
   */
  public static async configureApiKey(apiKey: string): Promise<{ success: boolean; status: PriceComparatorConfigStatus }> {
    const res = await fetch('/api/price-comparator/config-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) throw new Error('Error al configurar clave');
    return await res.json();
  }
}
