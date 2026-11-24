/** Keep PDFs as binary files, outside the small localStorage quota used by the diary. */
function receiptTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, commit?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('racion-receipt-files', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pdf');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('pdf', mode);
      const request = action(tx.objectStore('pdf'));
      let failure: unknown;
      if (commit) request.onsuccess = () => {
        try { commit(); } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('No se pudo acceder al recibo.')); };
    };
  });
}

export function saveReceiptPdf(id: string, file: Blob) {
  return receiptTransaction('readwrite', store => store.add(file.slice(0, file.size, 'application/pdf'), id));
}

export async function loadReceiptPdf(id: string): Promise<Blob> {
  const file = await receiptTransaction('readonly', store => store.get(id));
  if (!(file instanceof Blob)) throw new Error('El PDF no está disponible en este dispositivo.');
  return file;
}

/** Delete the named PDFs together, rolling back if the associated diary edit fails. */
export function removeReceiptPdfs(ids: string[], commit?: () => void) {
  if (!ids.length) { commit?.(); return Promise.resolve(); }
  return receiptTransaction('readwrite', store => {
    for (const id of ids.slice(0, -1)) store.delete(id);
    return store.delete(ids[ids.length - 1]);
  }, commit);
}

export async function exportReceiptPdf(id: string): Promise<string> {
  const file = await loadReceiptPdf(id);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
