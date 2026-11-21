import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** OCR support files are served by this app, loaded only when a receipt is read. */
export function receiptAssets(): Plugin {
  const root = resolve(import.meta.dirname, 'node_modules');
  const assets = new Map<string, string>();
  assets.set('ocr/worker.min.js', resolve(root, 'tesseract.js/dist/worker.min.js'));
  // Version 7 selects one of these LSTM cores according to the browser's SIMD support.
  for (const file of readdirSync(resolve(root, 'tesseract.js-core'))) {
    if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(file)) {
      assets.set(`ocr/core/${file}`, resolve(root, 'tesseract.js-core', file));
    }
  }
  for (const language of ['spa', 'eng']) {
    assets.set(`ocr/lang/${language}.traineddata.gz`,
      resolve(root, `@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`));
  }
  assets.set('ocr/pdf.worker.min.mjs', resolve(root, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
  for (const directory of ['standard_fonts', 'wasm']) {
    for (const file of readdirSync(resolve(root, 'pdfjs-dist', directory))) {
      assets.set(`ocr/pdf/${directory}/${file}`, resolve(root, 'pdfjs-dist', directory, file));
    }
  }
  for (const [name, location] of [
    ['tesseract', 'tesseract.js/LICENSE.md'], ['tesseract-core', 'tesseract.js-core/LICENSE'],
    ['pdfjs', 'pdfjs-dist/LICENSE'],
  ]) assets.set(`ocr/licenses/${name}.txt`, resolve(root, location));

  const sourceFor = (name: string, path: string) => {
    const source = readFileSync(path);
    if (name !== 'ocr/worker.min.js') return source;
    // Tesseract 7 can leave createWorker pending after a language-init failure.
    // Report the error first, then release that worker's WASM memory immediately.
    const cleanup = `;(() => { const send = self.postMessage.bind(self); self.postMessage = (message, ...transfer) => { send(message, ...transfer); if (message && message.status === 'reject' && ['load', 'loadLanguage', 'initialize'].includes(message.action)) setTimeout(() => self.close(), 0); }; self.addEventListener('error', () => self.close()); })();\n`;
    return Buffer.concat([Buffer.from(cleanup), source]);
  };

  let base = '/';
  return {
    name: 'racion-receipt-assets',
    configResolved(config) { base = config.base; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? '').split('?')[0].replace(/^\//, '');
        const key = pathname.startsWith(base.replace(/^\//, ''))
          ? pathname.slice(base.replace(/^\//, '').length) : pathname;
        const path = assets.get(key);
        if (!path) return next();
        const type = key.endsWith('.js') || key.endsWith('.mjs') ? 'text/javascript' :
          key.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
        response.setHeader('Content-Type', type);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(sourceFor(key, path));
      });
    },
    generateBundle() {
      for (const [fileName, path] of assets) {
        this.emitFile({ type: 'asset', fileName, source: sourceFor(fileName, path) });
      }
    },
  };
}
