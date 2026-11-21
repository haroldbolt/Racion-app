import { useEffect, useState } from 'react';
import { loadColombiaRegistry, registryPage } from '../services/colombiaRegistry';
import { findRegistrations } from '../utils/colombiaRegistryRows';

interface Props {
  query: string;
  species: 'dog' | 'cat';
  lang: 'es' | 'en';
  onChoose: (name: string) => void;
}

export function ColombiaRegistrySearch({query, species, lang, onChoose}: Props) {
  const es = lang === 'es';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registry, setRegistry] = useState<Awaited<ReturnType<typeof loadColombiaRegistry>>>();
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(8);
  useEffect(() => {setOpen(false); setLimit(8);}, [query, species]);
  async function lookup() {
    setOpen(true); setLoading(true); setError(false);
    try { setRegistry(await loadColombiaRegistry()); }
    catch { setError(true); }
    finally {setLoading(false);}
  }
  const matches = open && registry ? findRegistrations(registry.foods,query,species) : [];
  return <section aria-label={es ? 'Registro colombiano de alimentos' : 'Colombian food registry'} className="space-y-2 text-xs">
    <button type="button" disabled={loading} aria-expanded={open} onClick={open && !error ? () => setOpen(false) : lookup}
      className="min-h-11 font-bold text-[#0B5D2E] underline">
      {loading ? (es ? 'Consultando el ICA…' : 'Checking ICA…') : open && !error ? (es ? 'Ocultar registro ICA' : 'Hide ICA results') :
        (es ? 'Buscar también en el registro del ICA' : 'Also search the ICA registry')}
    </button>
    {open && !loading && <div className="space-y-2 rounded-xl border p-3">
      <p role="status">{error ? (es ? 'El listado del ICA está temporalmente fuera de alcance. Puedes abrirlo o ingresar la etiqueta.' : 'ICA registry unavailable. Open the source or enter the label.') :
        matches.length ? (es ? matches.length + ' registros para esta especie. Completa la etiqueta de tu presentación.' : matches.length + ' records for this species. Add your package label.') :
        (es ? 'Sin coincidencias en este listado para la especie elegida.' : 'No matches in this list for the selected species.')}</p>
      {matches.slice(0,limit).map(item => <div key={item.registration} className="space-y-1 rounded-xl bg-[#F5F9F6] p-2">
        <p className="font-bold">{item.name}</p>
        <p>ICA {item.registration} · {item.category}</p>
        <button type="button" onClick={() => onChoose(item.name)} className="min-h-10 font-bold text-[#0B5D2E]">{es ? 'Completar etiqueta' : 'Add label details'}</button>
      </div>)}
      {matches.length > limit && <button type="button" onClick={() => setLimit(n=>n+8)} className="min-h-10 font-bold">{es ? 'Ver más registros' : 'More records'}</button>}
      <a href={registry?.source ?? registryPage} target="_blank" rel="noopener noreferrer" className="block text-[#0B5D2E] underline">{es ? 'Ver el listado oficial del ICA' : 'View the official ICA list'}</a>
    </div>}
  </section>;
}
