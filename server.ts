import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const app = express();
const port = Number(process.env.PORT ?? 3000);
app.disable('x-powered-by');

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
