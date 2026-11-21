import { registryPath, registryResponse } from './workers/live-prices/colombiaRegistry';
import { catalogPath, colombiaFoodResponse } from './workers/live-prices/colombiaFoodRoute';
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

app.get(catalogPath, async (req, res, next) => {
  try {
    const result = await colombiaFoodResponse(new URL(req.originalUrl, 'http://localhost'), AbortSignal.timeout(15000));
    res.status(result.status).type('json').send(await result.text());
  } catch (error) { next(error); }
});

// This beta stores all user data locally. API requests must never fall through to the SPA.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not available in the local beta' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
  } else {
    const vite = await createViteServer({
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
