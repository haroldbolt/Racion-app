import type { Worker as OcrWorker } from 'tesseract.js';

export type ReceiptProgress = { stage: 'preparing' | 'loading' | 'recognizing' | 'pdf'; progress: number };
export interface ReceiptReadResult {
  text: string;
  previewDataUrl?: string;
  pageCount: number;
  pagesRead: number;
  warnings: string[];
  method: 'local_ocr' | 'pdf_text';
}
export interface ReceiptReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ReceiptProgress) => void;
  onPreview?: (url: string) => void;
}

const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.origin).href;
const maxBytes = 15 * 1024 * 1024;
const maxPages = 5;

function stopped(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Lectura cancelada', 'AbortError');
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  stopped(signal);
  let cancel: () => void;
  const cancellation = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason ?? new DOMException('Lectura cancelada', 'AbortError'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try { return await Promise.race([promise, cancellation]); }
  finally { signal.removeEventListener('abort', cancel!); }
}

function canvasFor(width: number, height: number, maxDimension = 2400): HTMLCanvasElement {
  if (!width || !height || width * height > 50_000_000) {
    throw new Error('La imagen es demasiado grande. Usa una foto de menor resolución.');
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function preview(canvas: HTMLCanvasElement): string {
  const small = canvasFor(canvas.width, canvas.height, 1400);
  const context = small.getContext('2d');
  if (!context) throw new Error('No pudimos preparar la factura.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, small.width, small.height);
  context.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', 0.82);
}

async function photoCanvas(file: File, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await abortable(image.decode(), signal);
    const canvas = canvasFor(image.naturalWidth, image.naturalHeight);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No pudimos preparar la imagen.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

type PdfTextItem = { str: string; transform: number[]; height?: number; width?: number; hasEOL?: boolean };
/** Reconstruct rows before parsing amounts: a PDF often stores each table cell separately. */
export function receiptPdfText(items: readonly unknown[]): string {
  const rows: Array<{ y: number; height: number; parts: Array<{ x: number; text: string }> }> = [];
  for (const value of items) {
    if (!value || typeof value !== 'object' || !('str' in value) || !('transform' in value)) continue;
    const item = value as PdfTextItem;
    if (typeof item.str !== 'string' || !Array.isArray(item.transform) || item.transform.length < 6 || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const height = Math.abs(item.height || item.transform[3] || 10);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= Math.max(2, Math.min(candidate.height, height) * 0.3));
    if (!row) { row = { y, height, parts: [] }; rows.push(row); }
    row.parts.push({ x, text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y)
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join('   ')).join('\n');
}

/** Receipts stay on the device. Only same-origin OCR support files are downloaded. */
export async function readReceipt(file: File, options: ReceiptReadOptions = {}): Promise<ReceiptReadResult> {
  if (!file.size || file.size > maxBytes) throw new Error('Usa una factura de hasta 15 MB.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && (!file.type.startsWith('image/') || file.type === 'image/svg+xml')) {
    throw new Error('Elige una foto JPG, PNG o WebP, o una factura PDF.');
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () => controller.abort(options.signal?.reason ?? new DOMException('Lectura cancelada', 'AbortError'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = window.setTimeout(() => controller.abort(new Error('La lectura tardó demasiado. Puedes completar los datos manualmente.')), 120_000);
  let worker: OcrWorker | undefined;
  let pdfLoadingTask: { destroy: () => Promise<void> } | undefined;
  let usedOcr = false;
  let recognitionPage = 0;
  let totalPages = 1;
  const report = (stage: ReceiptProgress['stage'], progress: number) => {
    if (!signal.aborted) options.onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)) });
  };
  const stopResources = () => {
    void worker?.terminate().catch(() => {});
    void pdfLoadingTask?.destroy().catch(() => {});
  };
  signal.addEventListener('abort', stopResources, { once: true });

  async function recognize(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
    usedOcr = true;
    if (!worker) {
      report('loading', 0);
      const { createWorker, OEM, PSM } = await abortable(import('tesseract.js'), signal);
      const pending = createWorker(['spa', 'eng'], OEM.LSTM_ONLY, {
        workerPath: asset('worker.min.js'),
        corePath: asset('core'),
        langPath: asset('lang'),
        workerBlobURL: false,
        gzip: true,
        logger(message) {
          if (message.status === 'recognizing text') report('recognizing', (recognitionPage + message.progress) / totalPages);
          else report('loading', message.progress ?? 0);
        },
        // Convert worker failures into recoverable errors; receipt contents are never logged.
        errorHandler() {},
      }).then(async (created) => {
        if (signal.aborted) { await created.terminate(); stopped(signal); }
        worker = created;
        return created;
      });
      worker = await abortable(pending, signal);
      await abortable(worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      }), signal);
    }
    report('recognizing', recognitionPage / totalPages);
    const result = await abortable(worker.recognize(canvas, {}, { text: true }), signal);
    return { text: result.data.text, confidence: result.data.confidence };
  }

  try {
    stopped(signal);
    report('preparing', 0);
    if (!isPdf) {
      const canvas = await photoCanvas(file, signal);
      const imagePreview = preview(canvas);
      stopped(signal);
      options.onPreview?.(imagePreview);
      const result = await recognize(canvas);
      stopped(signal);
      return { text: result.text, previewDataUrl: imagePreview, pageCount: 1, pagesRead: 1, method: 'local_ocr',
        warnings: result.confidence < 65 ? ['La imagen no se leyó con claridad. Revisa los valores o toma otra foto.'] : [] };
    }

    report('pdf', 0);
    const pdfjs = await abortable(import('pdfjs-dist/legacy/build/pdf.mjs'), signal);
    pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
    const bytes = new Uint8Array(await abortable(file.arrayBuffer(), signal));
    const task = pdfjs.getDocument({ data: bytes, disableAutoFetch: true,
      standardFontDataUrl: asset('pdf/standard_fonts/'), wasmUrl: asset('pdf/wasm/'), verbosity: 0 });
    pdfLoadingTask = task;
    const pdf = await abortable(task.promise, signal);
    totalPages = pdf.numPages;
    if (totalPages > maxPages) throw new Error('La factura tiene más de 5 páginas. Elige un PDF más corto o una foto de la página del alimento.');
    const texts: string[] = [];
    const warnings: string[] = [];
    let imagePreview: string | undefined;
    for (let number = 1; number <= totalPages; number++) {
      stopped(signal);
      report('pdf', (number - 1) / totalPages);
      const page = await abortable(pdf.getPage(number), signal);
      const content = await abortable(page.getTextContent(), signal);
      const nativeText = receiptPdfText(content.items);
      const hasNativeText = page.rotate % 360 === 0 && nativeText.replace(/\s/g, '').length >= 35 && /[\p{L}]/u.test(nativeText) && /\d/.test(nativeText);
      let canvas: HTMLCanvasElement | undefined;
      if (number === 1 || !hasNativeText) {
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, 2400 / Math.max(viewport.width, viewport.height));
        const scaled = page.getViewport({ scale });
        canvas = canvasFor(scaled.width, scaled.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No pudimos preparar esta página del PDF.');
        const rendering = page.render({ canvas, canvasContext: context, viewport: scaled, background: '#ffffff' });
        const cancelRendering = () => rendering.cancel();
        signal.addEventListener('abort', cancelRendering, { once: true });
        try { await abortable(rendering.promise, signal); }
        finally { signal.removeEventListener('abort', cancelRendering); }
        if (number === 1) {
          imagePreview = preview(canvas);
          stopped(signal);
          options.onPreview?.(imagePreview);
        }
      }
      if (hasNativeText) texts.push(nativeText);
      else {
        recognitionPage = number - 1;
        const recognized = await recognize(canvas!);
        texts.push(recognized.text);
        if (recognized.confidence < 65) warnings.push(`Revisa los datos de la página ${number}: la lectura no fue clara.`);
      }
      page.cleanup();
    }
    stopped(signal);
    return { text: texts.join('\n\n'), previewDataUrl: imagePreview, pageCount: totalPages, pagesRead: totalPages,
      method: usedOcr ? 'local_ocr' : 'pdf_text', warnings: [...warnings,
        ...(totalPages > 1 ? ['La vista previa corresponde a la primera página del PDF. Se leyeron todas sus páginas.'] : [])] };
  } catch (error) {
    if (signal.aborted) stopped(signal);
    if (error instanceof Error && /password/i.test(error.message)) {
      throw new Error('Este PDF tiene contraseña. Usa una copia sin contraseña o una foto de la factura.');
    }
    throw error instanceof Error ? error : new Error('No pudimos leer la factura. Puedes completar los datos manualmente.');
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    signal.removeEventListener('abort', stopResources);
    await worker?.terminate().catch(() => {});
    await pdfLoadingTask?.destroy().catch(() => {});
  }
}
