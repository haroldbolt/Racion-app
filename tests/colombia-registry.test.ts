import assert from 'node:assert/strict';
import test from 'node:test';
import { registryAttachment } from '../workers/live-prices/colombiaRegistry';
import { findRegistrations, registryRows } from '../src/utils/colombiaRegistryRows';

const word = (str:string, x:number, y:number) => ({str, transform:[0,4,-4,0,x,y]});
const header = [['Registro ICA',53],['Nombre producto',123],['Tipo producto',229],['Especies',639]] as const;

test('ICA rows retain their own species, wrapped names and registrations only', () => {
  const foods = registryRows([
    ...header.map(([str,y]) => word(str,58,y)),
    word('11705 AL',70,52),word('MIRRINGO',64,78),word('GATICOS',70,78),word('Alimentos completos o balanceados',70,200),word('Felinos',70,625),
    word('10023AL',76,52),word('FARO ADULTOS',76,78),word('Alimentos completos o balanceados',76,200),word('Caninos',76,625),
    word('10300SL',82,52),word('MEZCLA',82,78),word('Aditivos zootécnicos',82,200),word('Caninos',82,625),
    word('10301AL',88,52),word('AVES',88,78),word('Alimentos completos o balanceados',88,200),word('Aves',88,625),
  ]);
  assert.equal(foods.length,2);
  assert.equal(findRegistrations(foods,'gaticos mírringo','cat')[0]?.registration,'11705AL');
  assert.equal(findRegistrations(foods,'11705 AL','cat')[0]?.name,'MIRRINGO GATICOS');
  assert.equal(findRegistrations(foods,'ICA 11705 AL','cat')[0]?.name,'MIRRINGO GATICOS');
  assert.deepEqual(findRegistrations(foods,'11705','dog'),[]);
  assert.deepEqual(findRegistrations(foods,'no existe','cat'),[]);
  assert.throws(() => registryRows([word('Registro ICA',58,35)]),/layout_changed/);
});

test('national register downloads the attachment explicitly linked by the official list', () => {
  const path = '/getattachment/Areas/Pecuaria/Servicios/Alimentos-para-Animales/LISTADO-DE-ALIMENTOS-PARA-ANIMALES-REGISTRADOS/Registro-productos-Octubre-2026.pdf.aspx?lang=es-CO';
  assert.equal(registryAttachment('<a href="' + path + '">Consulte aquí</a>'),'https://www.ica.gov.co'+path);
  const archived = path.replace('Octubre-2026', 'Febrero-2023');
  assert.equal(registryAttachment('<a href="'+archived+'">(</a><a href="'+path+'"><strong>Consulte aquí</strong></a><a href="'+archived+'">)</a>'),'https://www.ica.gov.co'+path);
  for (const wrong of ['https://invalid.example'+path,'https://www.ica.gov.co/unrelated.pdf','https://test@www.ica.gov.co'+path]) {
    assert.equal(registryAttachment('<a href="'+wrong+'">PDF</a>'),undefined);
  }
});
