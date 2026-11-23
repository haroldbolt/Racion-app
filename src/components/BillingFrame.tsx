import type { ReactNode } from 'react';
import { publicAssetUrl } from '../utils/publicAssetUrl';

export const primaryButton = 'w-full rounded-xl bg-[#0B5D2E] px-4 py-3 font-extrabold text-white disabled:opacity-50';
export const textButton = 'rounded-lg px-2 py-2 text-sm font-bold text-[#0B5D2E] underline underline-offset-2 disabled:opacity-50';

export function AccessScreen({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#EAF4EC] px-4 py-12 text-[#1C2B21]">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img alt="" width="44" height="44" className="rounded-xl" src={publicAssetUrl('/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png')} />
          <span className="font-heading text-2xl font-extrabold text-[#0B5D2E]">Ración App</span>
        </div>
        <section className="space-y-4 rounded-3xl bg-white p-6 shadow-sm">{children}</section>
      </div>
    </main>
  );
}
