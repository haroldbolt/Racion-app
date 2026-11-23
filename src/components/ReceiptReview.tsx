import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, LoaderCircle, Trash2 } from 'lucide-react';
import { readReceipt, type ReceiptProgress, type ReceiptReadResult } from '../services/receiptReader';
import { extractReceipt, type ReceiptExtraction, type ReceiptItemCandidate } from '../utils/receiptExtraction';
import { formatCOP } from '../utils/i18n';

interface ReceiptReviewProps {
  language: 'es' | 'en';
  onNewFile: () => void;
  onReadingChange: (reading: boolean) => void;
  onSelectionRequiredChange: (required: boolean) => void;
  onPreview: (url: string) => void;
  onSelect: (item: ReceiptItemCandidate, extraction: ReceiptExtraction, method: ReceiptReadResult['method']) => void;
  onManual: () => void;
  onRemove: () => void;
}

export function ReceiptReview({ language, onNewFile, onReadingChange, onSelectionRequiredChange, onPreview, onSelect, onManual, onRemove }: ReceiptReviewProps) {
  const isEs = language === 'es';
  const operation = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File>();
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<ReceiptProgress>({ stage: 'preparing', progress: 0 });
  const [result, setResult] = useState<ReceiptReadResult>();
  const [extraction, setExtraction] = useState<ReceiptExtraction>();
  const [selectedId, setSelectedId] = useState<string>();
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, []);

  function selectItem(item: ReceiptItemCandidate, data = extraction, read = result) {
    if (!data || !read) return;
    setSelectedId(item.id);
    onSelectionRequiredChange(false);
    onSelect(item, data, read.method);
  }

  async function start(next: File) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setFile(next);
    setResult(undefined);
    setExtraction(undefined);
    setSelectedId(undefined);
    setPreview('');
    setError('');
    setCancelled(false);
    setProgress({ stage: 'preparing', progress: 0 });
    onNewFile();
    onSelectionRequiredChange(false);
    setReading(true);
    onReadingChange(true);
    try {
      const read = await readReceipt(next, { signal: controller.signal, onPreview: (url) => {
        if (operation.current === controller && !controller.signal.aborted) {
          setPreview(url);
          onPreview(url);
        }
      }, onProgress: (nextProgress) => {
        if (operation.current === controller && !controller.signal.aborted) setProgress(nextProgress);
      } });
      if (operation.current !== controller || controller.signal.aborted) return;
      const data = extractReceipt(read.text);
      setResult(read);
      setExtraction(data);
      if (read.previewDataUrl) {
        setPreview(read.previewDataUrl);
        onPreview(read.previewDataUrl);
      }
      onSelectionRequiredChange(data.items.length > 0);
      if (data.items.length === 1) selectItem(data.items[0], data, read);
    } catch (failure) {
      if (operation.current !== controller || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : (isEs ? 'No pudimos leer esta factura.' : 'Could not read this receipt.'));
    } finally {
      if (operation.current === controller) {
        setReading(false);
        onReadingChange(false);
        // Keep the completed token valid until another receipt replaces its attachment.
      }
    }
  }

  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setReading(false);
    onReadingChange(false);
    setCancelled(true);
    onSelectionRequiredChange(false);
    onManual();
  }

  function remove() {
    operation.current?.abort();
    operation.current = null;
    setFile(undefined);
    setReading(false);
    setPreview('');
    setResult(undefined);
    setExtraction(undefined);
    setSelectedId(undefined);
    setError('');
    setCancelled(false);
    onReadingChange(false);
    onSelectionRequiredChange(false);
    onRemove();
  }

  const stageLabel = {
    preparing: isEs ? 'Preparando factura' : 'Preparing receipt',
    loading: isEs ? 'Preparando lectura automática' : 'Preparing automatic reading',
    recognizing: isEs ? 'Leyendo factura' : 'Reading receipt',
    pdf: isEs ? 'Leyendo páginas del PDF' : 'Reading PDF pages',
  }[progress.stage];
  const warnings = [...new Set([...(result?.warnings ?? []), ...(extraction?.warnings ?? [])])];

  return (
    <section aria-label={isEs ? 'Revisión de la factura' : 'Receipt review'} className="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-inner)] p-3">
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 py-2 text-sm font-bold text-white">
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        {isEs ? 'Leer factura (foto o PDF)' : 'Read receipt (photo or PDF)'}
        <input aria-label={isEs ? 'Leer factura (foto o PDF)' : 'Read receipt (photo or PDF)'} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(event) => {
          const next = event.target.files?.[0];
          event.target.value = '';
          if (next) void start(next);
        }} />
      </label>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{isEs ? 'La factura se lee en este dispositivo. Revisa los artículos y confirma sus datos antes de guardar. Foto nítida o PDF de hasta 15 MB y 5 páginas.' : 'Your receipt is read on this device. Review its items and confirm the details before saving. Clear photo or PDF, up to 15 MB and 5 pages.'}</p>
      {file && <p className="break-words text-xs font-bold text-[var(--text-primary)]">{file.name}</p>}
      {reading && (
        <div className="space-y-2">
          <p role="status" className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{stageLabel} · {Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%</p>
          <progress aria-label={isEs ? 'Progreso de lectura de factura' : 'Receipt reading progress'} value={Math.max(0, Math.min(1, progress.progress))} max={1} className="h-2 w-full accent-[#0B5D2E]" />
          <button type="button" onClick={cancel} className="min-h-10 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold">{isEs ? 'Cancelar lectura' : 'Cancel reading'}</button>
        </div>
      )}
      {error && <p role="alert" className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-950"><AlertCircle aria-hidden="true" className="size-4 shrink-0" /><span>{error} {isEs ? 'Puedes volver a intentar o completar los datos manualmente.' : 'Retry or enter the details manually.'}</span></p>}
      {cancelled && <p role="status" className="text-xs text-[var(--text-secondary)]">{isEs ? 'Lectura cancelada. Puedes completar los datos manualmente.' : 'Reading cancelled. You can enter the details manually.'}</p>}
      {extraction && !reading && (
        <div className="space-y-3">
          <h4 className="text-sm font-extrabold text-[var(--text-primary)]">{isEs ? 'Artículos detectados' : 'Detected items'}</h4>
          <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Elige el alimento que compraste y contrasta sus datos con la factura.' : 'Choose the food you bought and check its details against the receipt.'}</p>
          {extraction.items.length === 0 && <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'No pudimos identificar una línea de alimento con suficiente claridad. Completa los campos que faltan con la factura a la vista.' : 'No food line was clear enough to identify. Complete the missing fields using your receipt.'}</p>}
          <div className="space-y-2">
            {extraction.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                <button type="button" aria-pressed={selectedId === item.id} onClick={() => selectItem(item)} className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-xs font-bold ${selectedId === item.id ? 'border-[#0B5D2E] bg-[#EAF4EC] text-[#0B5D2E]' : 'border-[var(--border-color)] text-[var(--text-primary)]'}`}>
                  {isEs ? 'Usar artículo:' : 'Use item:'} {item.description}
                </button>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{item.quantity === undefined ? (isEs ? 'Cantidad por confirmar' : 'Quantity to confirm') : `${item.quantity} ${isEs ? 'empaques' : 'packages'}`} · {item.packageKg === undefined ? (isEs ? 'Peso por confirmar' : 'Weight to confirm') : `${new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 3 }).format(item.packageKg)} kg`} · {item.totalPaidCop === undefined ? (isEs ? 'Importe por confirmar' : 'Amount to confirm') : formatCOP(item.totalPaidCop, true)}</p>
                <details className="mt-2 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer font-bold">{isEs ? 'Ver texto de este artículo' : 'View item text'}</summary><p className="mt-2 whitespace-pre-wrap break-words">{item.evidence}</p></details>
                {item.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-amber-800 dark:text-amber-200">{warning}</p>)}
              </div>
            ))}
          </div>
          {warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs text-amber-800 dark:text-amber-200">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <details className="text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer font-bold">{isEs ? 'Ver texto leído de la factura' : 'View recognized receipt text'}</summary>
            <p className="mt-2 font-bold">{result?.method === 'pdf_text' ? (isEs ? 'Texto original del PDF' : 'Original PDF text') : (isEs ? 'Texto reconocido en la imagen' : 'Text recognized from the image')}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans">{result?.text}</pre></details>
          <button type="button" onClick={() => { setSelectedId(undefined); onSelectionRequiredChange(false); onManual(); }} className="min-h-10 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold">{isEs ? 'Completar datos manualmente' : 'Enter details manually'}</button>
        </div>
      )}
      {file && !reading && <button type="button" onClick={() => void start(file)} className="min-h-10 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold">{isEs ? 'Volver a leer factura' : 'Read receipt again'}</button>}
      {preview && <div className="relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-white"><a href={preview} target="_blank" rel="noopener noreferrer"><img src={preview} alt={isEs ? 'Factura adjunta' : 'Attached receipt'} className="max-h-48 w-full object-contain" /></a><button type="button" onClick={remove} aria-label={isEs ? 'Quitar foto de factura' : 'Remove receipt photo'} className="absolute right-2 top-2 rounded-lg bg-white p-2 text-red-700"><Trash2 aria-hidden="true" className="size-4" /></button></div>}
      {file && !preview && !reading && <button type="button" onClick={remove} className="min-h-10 text-xs font-bold text-red-700">{isEs ? 'Quitar factura' : 'Remove receipt'}</button>}
    </section>
  );
}
