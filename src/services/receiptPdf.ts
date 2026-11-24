export const receiptAsset = (path: string) => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.origin).href;

export function isPdfReceipt(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function loadReceiptPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = receiptAsset('pdf.worker.min.mjs');
  return pdfjs;
}

export function openReceiptPdf(pdfjs: Awaited<ReturnType<typeof loadReceiptPdfJs>>, bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes, disableAutoFetch: true,
    standardFontDataUrl: receiptAsset('pdf/standard_fonts/'), wasmUrl: receiptAsset('pdf/wasm/'), verbosity: 0 });
}
