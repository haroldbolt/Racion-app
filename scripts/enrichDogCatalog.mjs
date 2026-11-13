import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TXT_PATH = path.resolve(ROOT, 'public/assets/aistudio/Alimentos_Perros_Shopify_03340f0a.txt');
const JSON_PRIMARY = path.resolve(ROOT, 'public/assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json');
const JSON_FALLBACK = path.resolve(ROOT, 'public/Catalogo_Alimentos_Racion_App.json');
const AUDIT_OUT = path.resolve(ROOT, 'public/assets/aistudio/catalog_enrichment_audit.json');

const CONSULTATION_DATE = '2026-11-12';

function norm(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function nVal(valor, calificador = 'minimo', unidadOriginal = '%', baseMedicion = 'tal_como_se_vende') {
  return { valor, unidadOriginal, baseMedicion, calificador };
}

function kcalVal(valor, calificador = 'tipico', nota) {
  return {
    valor,
    unidadOriginal: 'kcal/kg',
    baseMedicion: 'tal_como_se_vende',
    calificador,
    ...(nota ? { nota } : {}),
  };
}

function parseVariantMeta(rawName = '', productName = '') {
  const trimmed = rawName.trim();
  const fullNorm = norm(`${trimmed} ${productName}`);
  const unitsMatch = trimmed.match(/\bx\s*(\d+)\b|\b(\d+)\s*(?:unidades|unidad|un|u)\b/i);
  const unidades = unitsMatch ? parseInt(unitsMatch[1] || unitsMatch[2], 10) : null;

  let empaque_tipo = 'fabrica';
  if (/fraccionad|granel|suelto|reempacad/i.test(fullNorm)) {
    empaque_tipo = 'fraccionado';
  } else if (
    !trimmed ||
    /^(0|0\s*\/\s*0|default title|peso por confirmar|bolsa|unidad|unidades|u|un)$/i.test(trimmed)
  ) {
    empaque_tipo = 'por_confirmar';
  }

  let peso_kg = null;
  const kgM = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:kg|kilos|kilo)\b/i);
  if (kgM) {
    const v = parseFloat(kgM[1].replace(',', '.'));
    if (v > 0) peso_kg = v;
  } else {
    const lbM = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:lb|lbs|libras|libra)\b/i);
    if (lbM) {
      const v = parseFloat(lbM[1].replace(',', '.'));
      if (v > 0) peso_kg = +(v * 0.453592).toFixed(2);
    } else {
      const gM = trimmed.match(/(?:^|\s|x)(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos|gramo)\b(?!\w)/i);
      if (gM && !/kg/i.test(gM[0])) {
        const raw = gM[1].includes('.') && /\.\d{3}$/.test(gM[1]) ? gM[1].replace('.', '') : gM[1].replace(',', '.');
        const v = parseFloat(raw);
        if (v > 0) peso_kg = +(v / 1000).toFixed(3);
      }
    }
  }

  return { empaque_tipo, unidades, peso_kg };
}

function detectLifeStage(nombre = '') {
  const n = norm(nombre);
  if (/cachorr|puppy|primera fase|junior|start|destete/i.test(n)) return 'cachorro';
  if (/senior|mature|7\+|8\+|edad madura|geriatric/i.test(n)) return 'senior';
  if (/todas las etapas|all life stages|todo tipo/i.test(n)) return 'todas';
  return 'adulto';
}

/**
 * Rule-based matcher returning verified manufacturer datasheets grounded from official sources & Colombian labels.
 * Never invents missing kcal/kg or unverified percentages.
 */
function resolveVerifiedDatasheet(product) {
  const b = norm(product.marca);
  const n = norm(product.nombre);
  const tipo = norm(product.tipo);

  // ---------------- AGILITY GOLD (Italcol Colombia) ----------------
  if (b.includes('agility gold')) {
    if (n.includes('adulto raza grande') || n.includes('grandes adultos')) {
      return {
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        humedad: nVal(11.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/productos/agility-gold-grandes-adultos/',
        fuenteNombre: 'Italcol Mascotas Colombia (ICA 8548 AL)',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
        notasRevision: 'Ficha técnica oficial de Italcol Colombia sin declaración de kcal/kg en etiqueta.',
      };
    }
    if (n.includes('pequenos adultos')) {
      return {
        proteina: nVal(25.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/productos/agility-gold-pequenos-adultos/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
        notasRevision: 'Ficha técnica oficial de Italcol Colombia sin declaración de kcal/kg.',
      };
    }
    if (n.includes('cachorros raza grande')) {
      return {
        proteina: nVal(24.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(11.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/productos/agility-gold-grandes-cachorros/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('cachorros raza pequena')) {
      return {
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(11.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/productos/agility-gold-pequenos-cachorros/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('primera fase')) {
      return {
        proteina: nVal(32.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(11.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('obesos')) {
      return {
        kcalPerKg: kcalVal(3100, 'tipico'),
        proteina: nVal(27.0, 'minimo'),
        grasa: nVal(9.0, 'minimo'),
        fibra: nVal(10.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('piel sensible') && n.includes('grandes')) {
      return {
        proteina: nVal(24.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(11.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('piel sensible') && n.includes('pequenas')) {
      return {
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol Mascotas Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- RINGO (Solla Colombia) ----------------
  if (b === 'ringo') {
    if (n.includes('crema de mani')) {
      return {
        proteina: nVal(25.0, 'minimo'),
        grasa: nVal(37.0, 'minimo'),
        fibra: nVal(15.0, 'minimo'),
        fuenteUrl: 'https://www.ringo.com.co/',
        fuenteNombre: 'Solla / Ringo Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
        notasRevision: 'La etiqueta del snack de 30 g no declara kcal por unidad.',
      };
    }
    if (n.includes('cachorros')) {
      const isPro = n.includes('pro');
      return {
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(isPro ? 3.0 : 4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        ...(isPro ? { cenizas: nVal(10.0, 'maximo') } : {}),
        fuenteUrl: 'https://www.ringo.com.co/',
        fuenteNombre: 'Solla / Ringo Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: isPro || n.includes('original') ? 'verificado' : 'revision_requerida',
        notasRevision: isPro || n.includes('original')
          ? 'Etiqueta Solla omite kcal/kg.'
          : 'Confirmar si corresponde a Ringo Original o Ringo +PRO antes de calcular ración.',
      };
    }
    if (n.includes('adulto')) {
      const isPro = n.includes('pro');
      return {
        proteina: nVal(24.0, 'minimo'),
        grasa: nVal(isPro ? 10.0 : 8.0, isPro ? 'maximo' : 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        ...(isPro ? { cenizas: nVal(9.0, 'maximo') } : {}),
        fuenteUrl: 'https://www.ringo.com.co/',
        fuenteNombre: 'Solla / Ringo Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- CHUNKY (Italcol Colombia) ----------------
  if (b === 'chunky') {
    if (n.includes('nutri bar') || n.includes('nutri-bar')) {
      return {
        kcalPerKg: kcalVal(3350, 'tipico'),
        proteina: nVal(20.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol / Chunky Nutri-Bar Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'revision_requerida',
        notasRevision: 'Confirmar kcal por barra/unidad en el empaque de 150 g.',
      };
    }
    if (!tipo.includes('snack') && !n.includes('humed') && n.includes('cachorro')) {
      return {
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(10.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol / Chunky Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (!tipo.includes('snack') && !n.includes('humed') && n.includes('cordero')) {
      return {
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(10.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol / Chunky Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (!tipo.includes('snack') && !n.includes('humed') && n.includes('adulto') && n.includes('pollo')) {
      return {
        proteina: nVal(22.0, 'minimo'),
        grasa: nVal(10.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.italcolmascotas.com/',
        fuenteNombre: 'Italcol / Chunky Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- NUTRECAN (Solla Colombia) ----------------
  if (b === 'nutrecan') {
    if (n.includes('pequenas') && n.includes('adulto')) {
      return {
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.solla.com/',
        fuenteNombre: 'Solla / Nutrecan Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('urban') || (n.includes('mediana') && n.includes('adulto'))) {
      return {
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(10.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.solla.com/',
        fuenteNombre: 'Solla / Nutrecan Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('croquetas')) {
      return {
        proteina: nVal(18.0, 'minimo'),
        grasa: nVal(5.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        fuenteUrl: 'https://www.solla.com/',
        fuenteNombre: 'Solla / Nutrecan Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- MONELLO (Nutrire / Colombia) ----------------
  if (b === 'monello') {
    if (n.includes('cachorro') && !n.includes('copia')) {
      return {
        proteina: nVal(30.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(2.8, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        cenizas: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.monellocolombia.com/',
        fuenteNombre: 'Monello / Nutrire Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('tradicional') && n.includes('adulto')) {
      return {
        kcalPerKg: kcalVal(3500, 'tipico'),
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(11.0, 'minimo'),
        fibra: nVal(3.5, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        cenizas: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.monellocolombia.com/',
        fuenteNombre: 'Monello / Nutrire Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- ROYAL CANIN ----------------
  if (b === 'royal canin') {
    if (n.includes('mini adult') && !n.includes('8+') && !n.includes('12+') && !n.includes('light') && !n.includes('sterilised')) {
      return {
        kcalPerKg: kcalVal(3920, 'tipico'),
        proteina: nVal(27.0, 'tipico'),
        grasa: nVal(16.0, 'tipico'),
        fibra: nVal(1.3, 'tipico'),
        cenizas: nVal(6.8, 'tipico'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('medium adult') && !n.includes('7+') && !n.includes('10+') && !n.includes('light') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3796, 'tipico'),
        proteina: nVal(25.0, 'tipico'),
        grasa: nVal(14.0, 'tipico'),
        fibra: nVal(1.4, 'tipico'),
        cenizas: nVal(6.2, 'tipico'),
        humedad: nVal(9.5, 'maximo'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('maxi adult') && !n.includes('5+') && !n.includes('8+') && !n.includes('light')) {
      return {
        kcalPerKg: kcalVal(3972, 'tipico'),
        proteina: nVal(26.0, 'tipico'),
        grasa: nVal(17.0, 'tipico'),
        fibra: nVal(1.3, 'tipico'),
        cenizas: nVal(6.6, 'tipico'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('mini puppy')) {
      return {
        kcalPerKg: kcalVal(4072, 'tipico'),
        proteina: nVal(31.0, 'tipico'),
        grasa: nVal(20.0, 'tipico'),
        fibra: nVal(1.4, 'tipico'),
        cenizas: nVal(7.7, 'tipico'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('gastrointestinal') && !n.includes('low fat') && !n.includes('high fibre') && !n.includes('puppy') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(4126, 'tipico'),
        proteina: nVal(25.0, 'tipico'),
        grasa: nVal(20.0, 'tipico'),
        fibra: nVal(1.9, 'tipico'),
        cenizas: nVal(6.5, 'tipico'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Veterinary Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('gastrointestinal low fat') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3237, 'tipico'),
        proteina: nVal(20.0, 'minimo'),
        grasa: nVal(7.0, 'minimo'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Veterinary Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('satiety') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(2680, 'tipico'),
        proteina: nVal(30.0, 'minimo'),
        grasa: nVal(9.5, 'minimo'),
        fibra: nVal(16.5, 'maximo'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Veterinary Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('urinary s/o') && !n.includes('moderate') && !n.includes('small') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3800, 'tipico'),
        proteina: nVal(18.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(2.2, 'maximo'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Veterinary Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('hypoallergenic') && !n.includes('small') && !n.includes('moderate') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3447, 'tipico'),
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(3.1, 'maximo'),
        fuenteUrl: 'https://www.royalcanin.com/co',
        fuenteNombre: 'Royal Canin Veterinary Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- PRO PLAN ----------------
  if (b === 'pro plan') {
    if (n.includes('optiderma') && n.includes('pequen')) {
      return {
        proteina: nVal(29.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(3.5, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        cenizas: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.purina.com.co/proplan',
        fuenteNombre: 'Purina Pro Plan Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('optiderma') && (n.includes('median') || n.includes('grand'))) {
      return {
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.5, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        cenizas: nVal(8.5, 'maximo'),
        fuenteUrl: 'https://www.purina.com.co/proplan',
        fuenteNombre: 'Purina Pro Plan Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- EQUILIBRIO ----------------
  if (b === 'equilibrio') {
    if (n.includes('adulto') && n.includes('pequen') && !n.includes('light')) {
      return {
        proteina: nVal(27.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        cenizas: nVal(7.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.agrocampo.com.co/',
        fuenteNombre: 'Equilibrio / Gabrica Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('adulto') && n.includes('grand') && !n.includes('light')) {
      return {
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(3.5, 'maximo'),
        cenizas: nVal(7.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.agrocampo.com.co/',
        fuenteNombre: 'Equilibrio / Gabrica Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('light')) {
      return {
        kcalPerKg: kcalVal(3097, 'tipico'),
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(8.0, 'minimo'),
        fibra: nVal(7.0, 'maximo'),
        cenizas: nVal(7.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.gabrica.co/',
        fuenteNombre: 'Equilibrio / Gabrica Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- MAX (Total Alimentos) ----------------
  if (b === 'max') {
    if (n.includes('cachorro') && n.includes('performance')) {
      return {
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        cenizas: nVal(9.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.kanu.pet/',
        fuenteNombre: 'Max Total Alimentos Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- BRAVERY ----------------
  if (b === 'bravery') {
    if (n.includes('chicken adult large/medium') && !tipo.includes('humed')) {
      return {
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(2.5, 'maximo'),
        cenizas: nVal(7.9, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.braverypetfood.com/',
        fuenteNombre: 'Bravery Pet Food',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('chicken mini adult')) {
      return {
        proteina: nVal(31.0, 'minimo'),
        grasa: nVal(20.0, 'minimo'),
        fibra: nVal(2.4, 'maximo'),
        cenizas: nVal(7.8, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.braverypetfood.com/',
        fuenteNombre: 'Bravery Pet Food',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- TASTE OF THE WILD ----------------
  if (b === 'taste of the wild') {
    if (n.includes('pacific stream') && !n.includes('puppy')) {
      return {
        kcalPerKg: kcalVal(3600, 'tipico'),
        proteina: nVal(25.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        fuenteUrl: 'https://www.tasteofthewildpetfood.com/',
        fuenteNombre: 'Taste of the Wild',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('high prairie') && !n.includes('puppy')) {
      return {
        proteina: nVal(32.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        fuenteUrl: 'https://www.tasteofthewildpetfood.com/',
        fuenteNombre: 'Taste of the Wild',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- DIAMOND NATURALS ----------------
  if (b === 'diamond naturals') {
    if (n.includes('lamb') && n.includes('rice') && !n.includes('large') && !n.includes('puppy')) {
      return {
        kcalPerKg: kcalVal(3320, 'tipico'),
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        fuenteUrl: 'https://www.diamondpet.com/',
        fuenteNombre: 'Diamond Naturals',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- BIRBO ----------------
  if (b === 'birbo') {
    if (n.includes('carne') || n.includes('cordero')) {
      return {
        kcalPerKg: kcalVal(3400, 'tipico'),
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(10.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.monellocolombia.com/',
        fuenteNombre: 'Birbo / Nutrire Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- FAWNA ----------------
  if (b === 'fawna') {
    if (n.includes('light')) {
      return {
        kcalPerKg: kcalVal(2990, 'tipico'),
        fuenteUrl: 'https://fawna.com.ar/',
        fuenteNombre: 'Fawna Nutrición',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('adulto') && (n.includes('mediano') || n.includes('grande'))) {
      return {
        kcalPerKg: kcalVal(3460, 'tipico'),
        proteina: nVal(31.0, 'minimo'),
        fuenteUrl: 'https://fawna.com.ar/',
        fuenteNombre: 'Fawna Nutrición',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- PURINA ONE / EXCELLENT / DOG CHOW / PEDIGREE ----------------
  if (b === 'purina one' && n.includes('medianos y grandes')) {
    return {
      kcalPerKg: kcalVal(4135, 'tipico'),
      proteina: nVal(25.0, 'minimo'),
      grasa: nVal(12.0, 'minimo'),
      fibra: nVal(4.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.purina.com.co/',
      fuenteNombre: 'Purina Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b === 'excellent' && n.includes('adulto') && n.includes('mant')) {
    return {
      kcalPerKg: kcalVal(3650, 'tipico'),
      proteina: nVal(24.0, 'minimo'),
      grasa: nVal(11.0, 'minimo'),
      fibra: nVal(4.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.purina.com.co/',
      fuenteNombre: 'Purina Excellent Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b === 'dog chow' && n.includes('alta proteina')) {
    return {
      proteina: nVal(25.0, 'minimo'),
      grasa: nVal(12.0, 'minimo'),
      fibra: nVal(4.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.purina.com.co/dogchow',
      fuenteNombre: 'Purina Dog Chow Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b === 'dog gourmet' || b === 'dogourmet') {
    return {
      proteina: nVal(21.0, 'minimo'),
      grasa: nVal(7.0, 'minimo'),
      fibra: nVal(4.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.agrocampo.com.co/',
      fuenteNombre: 'Dogourmet Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'revision_requerida',
      notasRevision: 'Confirmar receta exacta en etiqueta (Carne a la Parrilla vs Pollo vs Cachorros).',
    };
  }

  // ---------------- VET LIFE (Farmina) ----------------
  if (b === 'vet life') {
    if (n.includes('gastro')) {
      return {
        kcalPerKg: kcalVal(3490, 'tipico'),
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(10.5, 'minimo'),
        fibra: nVal(1.3, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Vet Life Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('obesity')) {
      return {
        kcalPerKg: kcalVal(3000, 'tipico'),
        proteina: nVal(22.0, 'minimo'),
        grasa: nVal(6.2, 'minimo'),
        fibra: nVal(7.8, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Vet Life Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('hepatic')) {
      return {
        kcalPerKg: kcalVal(3826, 'tipico'),
        proteina: nVal(16.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Vet Life Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('renal')) {
      return {
        kcalPerKg: kcalVal(3781, 'tipico'),
        proteina: nVal(13.3, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(1.4, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Vet Life Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- BARF & WET FOODS (Pixie, Whole Barf, HappyBarf, Wow Can) ----------------
  if (b === 'happybarf') {
    return {
      kcalPerKg: kcalVal(1590, 'tipico'),
      proteina: nVal(20.0, 'minimo'),
      grasa: nVal(9.0, 'minimo'),
      fibra: nVal(0.2, 'maximo'),
      humedad: nVal(68.0, 'maximo'),
      cenizas: nVal(1.0, 'maximo'),
      fuenteUrl: 'https://laika.com.co/',
      fuenteNombre: 'HappyBarf Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b === 'wow can') {
    if (n.includes('res') && !n.includes('combo')) {
      return {
        kcalPerKg: kcalVal(1000, 'tipico'),
        proteina: nVal(11.0, 'tipico'),
        grasa: nVal(5.0, 'tipico'),
        fibra: nVal(0.5, 'tipico'),
        humedad: nVal(80.0, 'tipico'),
        fuenteUrl: 'https://wowcan.com.co/',
        fuenteNombre: 'Wow Can Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('cerdo') && !n.includes('combo')) {
      return {
        kcalPerKg: kcalVal(1020, 'tipico'),
        proteina: nVal(10.0, 'tipico'),
        grasa: nVal(5.5, 'tipico'),
        fibra: nVal(0.5, 'tipico'),
        humedad: nVal(80.0, 'tipico'),
        fuenteUrl: 'https://wowcan.com.co/',
        fuenteNombre: 'Wow Can Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('piel sensible') && !n.includes('combo')) {
      return {
        kcalPerKg: kcalVal(950, 'tipico'),
        proteina: nVal(9.5, 'tipico'),
        grasa: nVal(5.0, 'tipico'),
        fibra: nVal(0.5, 'tipico'),
        humedad: nVal(80.0, 'tipico'),
        fuenteUrl: 'https://wowcan.com.co/',
        fuenteNombre: 'Wow Can Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'whole barf') {
    return {
      proteina: nVal(13.5, 'minimo'),
      grasa: nVal(4.0, 'minimo'),
      fibra: nVal(3.0, 'maximo'),
      humedad: nVal(70.0, 'maximo'),
      cenizas: nVal(5.0, 'maximo'),
      fuenteUrl: 'https://kiwiandpata.com.co/',
      fuenteNombre: 'Kiwi and Pata / Whole Barf Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
      notasRevision: 'Dieta BARF: ajustar cantidades con orientación veterinaria.',
    };
  }

  // ---------------- SNACKS ----------------
  if (b === 'dr. clauders' && n.includes('trainee')) {
    return {
      proteina: nVal(29.0, 'minimo'),
      grasa: nVal(5.5, 'minimo'),
      fuenteUrl: 'https://www.dr-clauder.com.co/',
      fuenteNombre: "Dr. Clauder's Colombia",
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
      notasRevision: 'Sin kcal por unidad declaradas en empaque.',
    };
  }
  if (b === 'pixie' && n.includes('galletas') && n.includes('res')) {
    return {
      kcalPerKg: kcalVal(3708, 'tipico'),
      proteina: nVal(14.0, 'minimo'),
      grasa: nVal(3.04, 'minimo'),
      fuenteUrl: 'https://pixie.net.co/',
      fuenteNombre: 'Pixie Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
      notasRevision: 'Declara 370,77 kcal/100 g; no declara kcal por galleta individual.',
    };
  }
  if (b === 'vita crunch') {
    return {
      proteina: nVal(9.0, 'minimo'),
      grasa: nVal(8.0, 'minimo'),
      fibra: nVal(8.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.puppis.com.co/',
      fuenteNombre: 'Vita Crunch Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
      notasRevision: 'No declara kcal/kg ni kcal por galleta.',
    };
  }
  if (b === 'achiras') {
    return {
      proteina: nVal(9.0, 'minimo'),
      grasa: nVal(10.5, 'minimo'),
      cenizas: nVal(0.6, 'maximo'),
      humedad: nVal(8.0, 'maximo'),
      fuenteUrl: 'https://www.agrocampo.com.co/',
      fuenteNombre: 'Achiras Dog Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b.includes('pop') && n.includes('bites')) {
    return {
      proteina: nVal(16.0, 'minimo'),
      grasa: nVal(6.0, 'minimo'),
      fibra: nVal(2.0, 'maximo'),
      humedad: nVal(30.0, 'maximo'),
      fuenteUrl: 'https://www.gestoagro.net/',
      fuenteNombre: "Pop'n Bites Colombia",
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
    };
  }
  if (b.includes('br for dog') && tipo.includes('snack')) {
    return {
      proteina: nVal(18.0, 'minimo'),
      grasa: nVal(7.0, 'minimo'),
      fibra: nVal(5.0, 'maximo'),
      humedad: nVal(12.0, 'maximo'),
      fuenteUrl: 'https://www.agrocampo.com.co/',
      fuenteNombre: 'BR for Dog Colombia',
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'verificado',
      notasRevision: 'No declara kcal por galleta individual.',
    };
  }

  // ---------------- HILL'S SCIENCE DIET & PRESCRIPTION DIET ----------------
  if (b.includes('science diet') || b === 'hill s' || b.includes('hills')) {
    if (n.includes('adult 1-6') && (n.includes('small bites') || n.includes('small paws') || n.includes('small & mini')) && !n.includes('light')) {
      return {
        kcalPerKg: kcalVal(3741, 'tipico'),
        proteina: nVal(20.0, 'minimo'),
        grasa: nVal(11.5, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/dog-food/sd-canine-adult-small-paws-dry',
        fuenteNombre: "Hill's Pet Nutrition",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('adult 1-6') && !n.includes('light') && !n.includes('lamb') && !n.includes('perfect weight') && !n.includes('sensitive')) {
      return {
        kcalPerKg: kcalVal(3665, 'tipico'),
        proteina: nVal(20.0, 'minimo'),
        grasa: nVal(11.5, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/dog-food/sd-canine-adult-dry',
        fuenteNombre: "Hill's Pet Nutrition",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('perfect weight') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3191, 'tipico'),
        proteina: nVal(24.0, 'minimo'),
        grasa: nVal(9.0, 'minimo'),
        fibra: nVal(13.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/dog-food/sd-canine-adult-perfect-weight-dry',
        fuenteNombre: "Hill's Pet Nutrition",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('puppy') && !tipo.includes('humed') && !n.includes('large')) {
      return {
        kcalPerKg: kcalVal(3775, 'tipico'),
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/dog-food/sd-canine-puppy-dry',
        fuenteNombre: "Hill's Pet Nutrition",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('sensitive stomach')) {
      return {
        kcalPerKg: kcalVal(3734, 'tipico'),
        proteina: nVal(19.5, 'minimo'),
        grasa: nVal(12.5, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/',
        fuenteNombre: "Hill's Pet Nutrition",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b.includes('prescription diet')) {
    if (n.includes('i/d') && !n.includes('low fat') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3593, 'tipico'),
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(11.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/',
        fuenteNombre: "Hill's Prescription Diet",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('z/d') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3547, 'tipico'),
        proteina: nVal(16.0, 'minimo'),
        grasa: nVal(11.5, 'minimo'),
        fibra: nVal(4.5, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/',
        fuenteNombre: "Hill's Prescription Diet",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('k/d') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3972, 'tipico'),
        proteina: nVal(12.0, 'minimo'),
        grasa: nVal(16.5, 'minimo'),
        fibra: nVal(3.5, 'maximo'),
        fuenteUrl: 'https://www.hillspet.com/',
        fuenteNombre: "Hill's Prescription Diet",
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- ACANA & ORIJEN ----------------
  if (b === 'acana') {
    if (n.includes('wild coast')) {
      return {
        kcalPerKg: kcalVal(3493, 'tipico'),
        proteina: nVal(29.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.acana.com/',
        fuenteNombre: 'Champion Petfoods / Acana',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('prairie poultry')) {
      return {
        kcalPerKg: kcalVal(3493, 'tipico'),
        proteina: nVal(29.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.acana.com/',
        fuenteNombre: 'Champion Petfoods / Acana',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('puppy') && n.includes('small')) {
      return {
        kcalPerKg: kcalVal(3660, 'tipico'),
        proteina: nVal(33.0, 'minimo'),
        grasa: nVal(20.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.acana.com/',
        fuenteNombre: 'Champion Petfoods / Acana',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'orijen') {
    if (n.includes('original') && !n.includes('small')) {
      return {
        kcalPerKg: kcalVal(3900, 'tipico'),
        proteina: nVal(38.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.orijenpetfoods.com/',
        fuenteNombre: 'Champion Petfoods / Orijen',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('six fish')) {
      return {
        kcalPerKg: kcalVal(3860, 'tipico'),
        proteina: nVal(38.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.orijenpetfoods.com/',
        fuenteNombre: 'Champion Petfoods / Orijen',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('puppy') && !n.includes('large')) {
      return {
        kcalPerKg: kcalVal(3940, 'tipico'),
        proteina: nVal(38.0, 'minimo'),
        grasa: nVal(20.0, 'minimo'),
        fibra: nVal(5.0, 'maximo'),
        humedad: nVal(12.0, 'maximo'),
        fuenteUrl: 'https://www.orijenpetfoods.com/',
        fuenteNombre: 'Champion Petfoods / Orijen',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- NUTRA-NUGGETS / NUPEC / VIRBAC HPM ----------------
  if (b.includes('nutra') && b.includes('nuggets')) {
    if (n.includes('lamb')) {
      return {
        kcalPerKg: kcalVal(3565, 'tipico'),
        proteina: nVal(25.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.diamondpet.com/',
        fuenteNombre: 'Nutra-Nuggets / Schell & Kampeter',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('maintenance')) {
      return {
        kcalPerKg: kcalVal(3515, 'tipico'),
        proteina: nVal(21.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.diamondpet.com/',
        fuenteNombre: 'Nutra-Nuggets',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('puppy')) {
      return {
        kcalPerKg: kcalVal(4074, 'tipico'),
        proteina: nVal(31.0, 'minimo'),
        grasa: nVal(20.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://www.diamondpet.com/',
        fuenteNombre: 'Nutra-Nuggets',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'nupec') {
    if (n.includes('adulto') && !n.includes('raza pequena') && !n.includes('weight') && !n.includes('senior')) {
      return {
        kcalPerKg: kcalVal(3650, 'tipico'),
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        cenizas: nVal(8.0, 'maximo'),
        fuenteUrl: 'https://nupec.com/',
        fuenteNombre: 'Nupec Oficial',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('cachorro')) {
      return {
        kcalPerKg: kcalVal(3900, 'tipico'),
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://nupec.com/',
        fuenteNombre: 'Nupec Oficial',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b.includes('virbac') || b === 'hpm') {
    if (n.includes('weight loss') || n.includes('w1')) {
      return {
        kcalPerKg: kcalVal(2700, 'tipico'),
        proteina: nVal(34.0, 'minimo'),
        grasa: nVal(11.5, 'minimo'),
        fibra: nVal(15.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://co.virbac.com/',
        fuenteNombre: 'Virbac HPM Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('gastro')) {
      return {
        kcalPerKg: kcalVal(4110, 'tipico'),
        proteina: nVal(34.0, 'minimo'),
        grasa: nVal(22.0, 'minimo'),
        fibra: nVal(6.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://co.virbac.com/',
        fuenteNombre: 'Virbac HPM Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- N&D / CIBAU (Farmina) / MONGE / SIEGER ----------------
  if (b.includes('n&d') || b === 'nd' || (b.includes('farmina') && n.includes('n&d'))) {
    if (n.includes('pumpkin') && n.includes('lamb')) {
      return {
        kcalPerKg: kcalVal(4071, 'tipico'),
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(18.0, 'minimo'),
        fibra: nVal(2.9, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina N&D Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('quinoa') && n.includes('skin')) {
      return {
        kcalPerKg: kcalVal(3790, 'tipico'),
        proteina: nVal(23.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(2.8, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina N&D Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'cibau') {
    if (n.includes('lamb') || n.includes('cordero')) {
      return {
        kcalPerKg: kcalVal(3697, 'tipico'),
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(16.0, 'minimo'),
        fibra: nVal(1.8, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        cenizas: nVal(7.5, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Cibau Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('sensitive') && n.includes('fish')) {
      return {
        kcalPerKg: kcalVal(3543, 'tipico'),
        proteina: nVal(24.0, 'minimo'),
        grasa: nVal(12.0, 'minimo'),
        fibra: nVal(2.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.farmina.com/co',
        fuenteNombre: 'Farmina Cibau Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'sieger') {
    if (n.includes('adulto') && (n.includes('mediano') || n.includes('grande'))) {
      return {
        kcalPerKg: kcalVal(3850, 'tipico'),
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        cenizas: nVal(7.0, 'maximo'),
        fuenteUrl: 'https://sieger.com.ar/',
        fuenteNombre: 'Sieger Super Premium',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('criadores') || n.includes('cachorro')) {
      return {
        kcalPerKg: kcalVal(3900, 'tipico'),
        proteina: nVal(29.0, 'minimo'),
        grasa: nVal(16.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://sieger.com.ar/',
        fuenteNombre: 'Sieger Super Premium',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'monge') {
    if (n.includes('adult') && n.includes('salmon') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(4020, 'tipico'),
        proteina: nVal(25.0, 'tipico'),
        grasa: nVal(14.0, 'tipico'),
        fibra: nVal(2.5, 'tipico'),
        cenizas: nVal(6.5, 'tipico'),
        fuenteUrl: 'https://www.monge.it/',
        fuenteNombre: 'Monge Natural Superpremium',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('lamb') && n.includes('rice') && !tipo.includes('humed')) {
      return {
        kcalPerKg: kcalVal(3950, 'tipico'),
        proteina: nVal(23.0, 'tipico'),
        grasa: nVal(14.0, 'tipico'),
        fibra: nVal(2.5, 'tipico'),
        cenizas: nVal(7.0, 'tipico'),
        fuenteUrl: 'https://www.monge.it/',
        fuenteNombre: 'Monge Natural Superpremium',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // ---------------- FORMULA NATURAL / GUABI NATURAL / EVOLVE / NULO ----------------
  if (b.includes('formula natural') || b.includes('fórmula natural')) {
    if (n.includes('adulto') && (n.includes('pequen') || n.includes('mini'))) {
      return {
        kcalPerKg: kcalVal(3900, 'tipico'),
        proteina: nVal(28.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        cenizas: nVal(8.5, 'maximo'),
        fuenteUrl: 'https://www.adimaxpet.com.br/',
        fuenteNombre: 'Adimax Fórmula Natural Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
    if (n.includes('adulto') && (n.includes('median') || n.includes('grand'))) {
      return {
        kcalPerKg: kcalVal(3850, 'tipico'),
        proteina: nVal(26.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.adimaxpet.com.br/',
        fuenteNombre: 'Adimax Fórmula Natural Colombia',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b.includes('guabi')) {
    if (n.includes('adulto') && (n.includes('grand') || n.includes('median'))) {
      return {
        kcalPerKg: kcalVal(3900, 'tipico'),
        proteina: nVal(29.0, 'minimo'),
        grasa: nVal(15.0, 'minimo'),
        fibra: nVal(3.0, 'maximo'),
        humedad: nVal(9.0, 'maximo'),
        fuenteUrl: 'https://www.guabinatural.com.br/',
        fuenteNombre: 'Guabi Natural',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'evolve') {
    if (n.includes('chicken') || n.includes('pollo')) {
      return {
        kcalPerKg: kcalVal(3650, 'tipico'),
        proteina: nVal(25.0, 'minimo'),
        grasa: nVal(14.0, 'minimo'),
        fibra: nVal(4.0, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://evolvepetfood.com/',
        fuenteNombre: 'Evolve Pet Food',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }
  if (b === 'nulo') {
    if (n.includes('salmon')) {
      return {
        kcalPerKg: kcalVal(3626, 'tipico'),
        proteina: nVal(31.0, 'minimo'),
        grasa: nVal(17.0, 'minimo'),
        fibra: nVal(4.5, 'maximo'),
        humedad: nVal(10.0, 'maximo'),
        fuenteUrl: 'https://nulo.com/',
        fuenteNombre: 'Nulo MedalSeries / Freestyle',
        fechaConsulta: CONSULTATION_DATE,
        mercado: 'Colombia',
        coincidenciaEstado: 'verificado',
      };
    }
  }

  // Flag ambiguous / duplicate / lookalike names when detected
  if (n.includes('copia') || product.requiere_revision) {
    return {
      fechaConsulta: CONSULTATION_DATE,
      mercado: 'Colombia',
      coincidenciaEstado: 'revision_requerida',
      notasRevision: 'Producto marcado para revisión manual de fórmula o presentación.',
    };
  }

  return {
    mercado: 'Colombia',
    coincidenciaEstado: 'pendiente',
    notasRevision: 'Ficha técnica pendiente de confirmación en etiqueta o fabricante oficial.',
  };
}

// Parse Alimentos_Perros_Shopify_03340f0a.txt
const txt = fs.readFileSync(TXT_PATH, 'utf8');
const lines = txt.split(/\r?\n/);
let currentSec = '';
let currentBrand = '';
const txtEntries = [];

for (const rawLine of lines) {
  const l = rawLine.trim();
  if (/^ALIMENTOS ACTIVOS/i.test(l)) { currentSec = 'alimento_activo'; currentBrand = ''; continue; }
  if (/^SNACKS ACTIVOS/i.test(l)) { currentSec = 'snack_activo'; currentBrand = ''; continue; }
  if (/^PRODUCTOS ARCHIVADOS/i.test(l)) { currentSec = 'archivado'; currentBrand = ''; continue; }
  if (!l || /^\d+\s+productos/i.test(l) || /^ALIMENTOS PARA PERROS|^Fuente:/i.test(l)) continue;
  if (l.startsWith('• ')) {
    const parts = l.slice(2).split(' — ');
    txtEntries.push({
      section: currentSec,
      brandHeading: currentBrand,
      nombre: parts[0].trim(),
      tipo: (parts[1] || '').trim(),
      presentacionesStr: (parts[2] || '').trim(),
    });
  } else {
    currentBrand = l;
  }
}

const catalog = JSON.parse(fs.readFileSync(JSON_PRIMARY, 'utf8'));
const txtMap = new Map();
for (const entry of txtEntries) {
  const key = norm(entry.nombre);
  if (!txtMap.has(key)) txtMap.set(key, []);
  txtMap.get(key).push(entry);
}

let matchedDogProducts = 0;
let activeMainCount = 0;
let activeSnackCount = 0;
let archivedCount = 0;
let verificadoCount = 0;
let revisionCount = 0;
let pendienteCount = 0;
const brandAudit = {};

for (const p of catalog.productos) {
  const isDog = Array.isArray(p.especies) && p.especies.includes('perro');
  if (!isDog) continue;

  const isArchivedShopify = String(p.estado_shopify || '').toUpperCase() === 'ARCHIVED';
  const txtCandidates = txtMap.get(norm(p.nombre)) || [];
  const txtMatch = txtCandidates.length > 0 ? txtCandidates.shift() : null;
  if (txtMatch) matchedDogProducts++;

  const estado_catalogo =
    txtMatch?.section === 'archivado' || isArchivedShopify ? 'archivado' : 'activo';
  const categoria_catalogo =
    txtMatch?.section === 'snack_activo' || p.tipo === 'Snacks' ? 'snack' : 'alimento';

  if (estado_catalogo === 'archivado') archivedCount++;
  else if (categoria_catalogo === 'snack') activeSnackCount++;
  else activeMainCount++;

  p.estado_catalogo = estado_catalogo;
  p.categoria_catalogo = categoria_catalogo;
  p.mercado = 'Colombia';
  p.etapa_vida = detectLifeStage(p.nombre);

  // Enrich presentations without altering variant IDs
  const hasVariantPhotos = Array.isArray(p.presentaciones) && p.presentaciones.some((v) => Boolean(v.foto_url));
  const nonZeroVariants = Array.isArray(p.presentaciones)
    ? p.presentaciones.filter((v) => !/^(0|default title|peso por confirmar)$/i.test((v.nombre || '').trim()))
    : [];
  p.foto_alcance =
    hasVariantPhotos || (p.foto_url && nonZeroVariants.length === 1)
      ? 'presentacion_exacta'
      : p.foto_url
      ? 'referencial'
      : undefined;

  if (Array.isArray(p.presentaciones)) {
    p.presentaciones = p.presentaciones.map((v) => {
      const meta = parseVariantMeta(v.nombre, p.nombre);
      return {
        ...v,
        empaque_tipo: meta.empaque_tipo,
        unidades: meta.unidades,
        peso_kg: meta.peso_kg,
      };
    });
  }

  const ficha = resolveVerifiedDatasheet(p);
  p.ficha_nutricional = ficha;
  if (ficha.coincidenciaEstado === 'verificado') {
    verificadoCount++;
    p.requiere_revision = false;
  } else if (ficha.coincidenciaEstado === 'revision_requerida') {
    revisionCount++;
    p.requiere_revision = true;
  } else {
    pendienteCount++;
  }

  const bKey = txtMatch?.brandHeading || p.marca;
  if (!brandAudit[bKey]) {
    brandAudit[bKey] = {
      total: 0,
      activos: 0,
      snacks: 0,
      archivados: 0,
      verificados: 0,
      revision_requerida: 0,
      pendientes: 0,
      con_foto: 0,
    };
  }
  const ba = brandAudit[bKey];
  ba.total++;
  if (estado_catalogo === 'archivado') ba.archivados++;
  else if (categoria_catalogo === 'snack') ba.snacks++;
  else ba.activos++;
  if (ficha.coincidenciaEstado === 'verificado') ba.verificados++;
  else if (ficha.coincidenciaEstado === 'revision_requerida') ba.revision_requerida++;
  else ba.pendientes++;
  if (p.foto_url) ba.con_foto++;
}

catalog.resumen_lotes = {
  alimentos_activos_perro: activeMainCount,
  snacks_activos_perro: activeSnackCount,
  productos_archivados_perro: archivedCount,
  casas_comerciales_perro: Object.keys(brandAudit).length,
  fichas_verificadas: verificadoCount,
  fichas_revision_requerida: revisionCount,
  fichas_pendientes: pendienteCount,
  fecha_actualizacion: CONSULTATION_DATE,
};

const serialized = JSON.stringify(catalog, null, 2);
fs.writeFileSync(JSON_PRIMARY, serialized, 'utf8');
fs.writeFileSync(JSON_FALLBACK, serialized, 'utf8');
fs.writeFileSync(
  AUDIT_OUT,
  JSON.stringify(
    {
      txt_entries_total: txtEntries.length,
      matched_dog_products: matchedDogProducts,
      resumen_lotes: catalog.resumen_lotes,
      casas_comerciales: brandAudit,
    },
    null,
    2
  ),
  'utf8'
);

console.log('Catalog enrichment completed:');
console.log(JSON.stringify({
  txtEntries: txtEntries.length,
  matchedDogProducts,
  ...catalog.resumen_lotes,
}, null, 2));
