import { registryNutritionPath, registryNutritionResponse } from './workers/live-prices/registryNutrition';
import { registryPath, registryResponse } from './workers/live-prices/colombiaRegistry';
import { catalogPath, colombiaFoodResponse } from './workers/live-prices/colombiaFoodRoute';
import { quotePostalOffers } from './workers/live-prices/postalShipping';
import { parseLivePriceRequest, unavailablePriceResult } from './workers/live-prices/service';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const app = express();
const port = Number(process.env.PORT ?? 3000);
app.disable('x-powered-by');

app.get(registryPath, async (_req, res, next) => {
  try {
    const result = await registryResponse(new URL(registryPath, 'http://localhost'), AbortSignal.timeout(15000));
    result.headers.forEach((value, key) => res.set(key, value));
    res.status(result.status).send(Buffer.from(await result.arrayBuffer()));
  } catch (error) { next(error); }
});

app.get([catalogPath, registryNutritionPath], async (req, res, next) => {
  try {
    const lookup = req.path === registryNutritionPath ? registryNutritionResponse : colombiaFoodResponse;
    const result = await lookup(new URL(req.originalUrl, 'http://localhost'), AbortSignal.timeout(15000));
    res.status(result.status).type('json').send(await result.text());
  } catch (error) { next(error); }
});

// The local app can quote a delivery directly with the same merchants as the Worker.
app.post('/api/live-prices', express.json({ limit: '1kb' }), async (req, res, next) => {
  const request = parseLivePriceRequest(req.body);
  if (!request) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const baseline = unavailablePriceResult(request.city, 'not_configured');
    const result = request.postalCode
      ? await quotePostalOffers(baseline, request.product, request.postalCode, fetch)
      : baseline;
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) { next(error); }
});

// The billing sandbox uses a separate Worker. Never serve the SPA for an unknown API route.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not available in the local beta' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
  } else {
    const vite = await createViteServer({
      mode: process.env.RACION_LOCAL_MODE === 'anonymous-beta' ? 'anonymous-beta' : 'development',
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, () => {
    console.log(`[Ración App] http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('[Ración App] Server could not start:', error);
  process.exitCode = 1;
});
