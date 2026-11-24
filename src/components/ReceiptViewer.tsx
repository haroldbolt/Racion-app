import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import { loadReceiptPdf } from '../services/receiptDocuments';
import { loadReceiptPdfJs, openReceiptPdf } from '../services/receiptPdf';
import type { FoodCostEntry } from '../types';

interface Props {
  image: string;
  pdf?: File | string;
  legacyImage?: boolean;
  isEs: boolean;
  onClose: () => void;
}

function PdfPages({ file, isEs }: { file: Blob; isEs: boolean }) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [rendered, setRendered] = useState(0);
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof openReceiptPdf>;
    void (async () => {
      const [pdfjs, bytes] = await Promise.all([loadReceiptPdfJs(), file.arrayBuffer()]);
      if (!active) return;
      task = openReceiptPdf(pdfjs, new Uint8Array(bytes));
      const pdf = await task.promise;
      if (active) setDocument(pdf);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; void task?.destroy().catch(() => {}); };
  }, [file]);

  useEffect(() => {
    if (!document) return;
    setRendered(0);
    let active = true;
    let render: RenderTask;
    void (async () => {
      const sheet = await document.getPage(page);
      const surface = canvas.current;
      if (!active || !surface) return;
      const original = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({ scale: Math.min(2, 1600 / Math.max(original.width, original.height)) });
      surface.width = Math.ceil(viewport.width);
      surface.height = Math.ceil(viewport.height);
      render = sheet.render({ canvas: surface, viewport, background: '#fff' });
      await render.promise;
      if (active) setRendered(page);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; render?.cancel(); };
  }, [document, page]);

  if (failed) return <p role="alert">{isEs ? 'Puedes descargar el PDF para abrirlo en tu lector.' : 'Download the PDF to open it in your reader.'}</p>;
  return <>
    {document && <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" disabled={page === 1} className="min-h-11 font-bold disabled:opacity-40" onClick={() => setPage(page - 1)}>{isEs ? 'Página anterior' : 'Previous page'}</button>
      <span aria-live="polite">{isEs ? 'Página' : 'Page'} {page} {isEs ? 'de' : 'of'} {document.numPages}</span>
      <button type="button" disabled={page === document.numPages} className="min-h-11 font-bold disabled:opacity-40" onClick={() => setPage(page + 1)}>{isEs ? 'Página siguiente' : 'Next page'}</button>
    </div>}
    {rendered !== page && <p role="status">{isEs ? 'Abriendo página…' : 'Opening page…'}</p>}
    <canvas key={page} ref={canvas} role="img" aria-label={isEs ? `Página ${page} del recibo` : `Receipt page ${page}`} className="h-auto w-full" hidden={rendered !== page} />
  </>;
}

export function ReceiptViewer({ image, pdf, legacyImage, isEs, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<Blob>();
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileMissing, setFileMissing] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let url: string | undefined;
    const getFile = typeof pdf === 'string' ? loadReceiptPdf(pdf) : Promise.resolve(pdf);
    void getFile.then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFile(blob);
    }).catch(() => { if (active) setFileMissing(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [pdf]);
  return createPortal(
    <dialog ref={dialog} aria-label={isEs ? 'Recibo de la compra' : 'Purchase receipt'} onCancel={event => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-2xl space-y-3 overflow-auto rounded-2xl bg-[var(--surface-card)] p-4 text-sm text-[var(--text-primary)] shadow-xl backdrop:bg-black/60">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-bold">{isEs ? 'Recibo de la compra' : 'Purchase receipt'}</h3>
        <button type="button" autoFocus onClick={onClose} className="min-h-11 font-bold">{isEs ? 'Cerrar recibo' : 'Close receipt'}</button>
      </header>
      {pdf && !file && !fileMissing && <p role="status">{isEs ? 'Abriendo PDF…' : 'Opening PDF…'}</p>}
      {fileMissing && <p role="alert">{isEs ? 'El PDF no está disponible en este dispositivo. Puedes ver la primera página guardada.' : 'The PDF is unavailable on this device. Its saved first page is shown below.'}</p>}
      {file && <PdfPages file={file} isEs={isEs} />}
      {(!pdf || fileMissing) && <>
        {legacyImage && <p>{isEs ? 'Imagen guardada con la compra. Si adjuntaste un PDF, esta copia muestra su primera página.' : 'Image saved with the purchase. If you attached a PDF, this copy shows its first page.'}</p>}
        <img src={image} alt={isEs ? 'Imagen del recibo' : 'Receipt image'} className="mx-auto h-auto max-w-full rounded-lg" />
      </>}
      {(downloadUrl || !pdf || fileMissing) && <a href={downloadUrl || image} download={downloadUrl ? 'recibo.pdf' : 'recibo'} className="inline-flex min-h-11 items-center font-bold text-[#0B5D2E] underline dark:text-green-300">
        {downloadUrl ? (isEs ? 'Descargar PDF' : 'Download PDF') : (isEs ? 'Descargar imagen' : 'Download image')}
      </a>}
    </dialog>, document.body);
}

export function SavedReceipt({ purchase, isEs }: { purchase: FoodCostEntry; isEs: boolean }) {
  const [open, setOpen] = useState(false);
  const image = purchase.receiptPhotoUrl;
  if (!image) return null;
  // Only raster images stored by the attachment controls can be opened or downloaded.
  if (!/^data:image\/(?:jpe?g|pjpeg|apng|png|webp|gif|bmp|x-ms-bmp|avif|hei[cf](?:-sequence)?|tiff|x-icon);base64,/i.test(image)) {
    return <p className="text-xs">{isEs ? 'Vista previa del recibo no disponible.' : 'Receipt preview unavailable.'}</p>;
  }
  return <>
    <button type="button" aria-label={isEs ? 'Ver recibo' : 'View receipt'} aria-haspopup="dialog" onClick={() => setOpen(true)} className="inline-block min-h-11 text-left text-xs font-bold text-[#0B5D2E] dark:text-green-300">
      <img src={image} alt={isEs ? 'Factura de esta compra' : 'Receipt for this purchase'} loading="lazy" className="mb-1 max-h-32 rounded-xl border border-[var(--border-color)] object-contain" />
      {isEs ? 'Ver recibo' : 'View receipt'}
    </button>
    {open && <ReceiptViewer image={image} pdf={purchase.receiptFormat === 'pdf' ? purchase.id : undefined} legacyImage={!purchase.receiptFormat} isEs={isEs} onClose={() => setOpen(false)} />}
  </>;
}
