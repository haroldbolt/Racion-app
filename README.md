# Ración App 🐶🐱

> **"La ración exacta de cualquier alimento, para cualquier perro o gato, con seguimiento hasta su peso ideal."**  
> **Pago único: 18 USD | PWA instalable y offline | Español e inglés**

---

## 1. Configuración de Pasarelas de Pago (Paddle / Polar & Mercado Pago)

Ración App está diseñada para cobro único mundial de 18 USD sin suscripciones mensuales:

### A. Paddle / Polar (Merchant of Record Global)
1. Crea tu cuenta en [Polar.sh](https://polar.sh) o [Paddle.com](https://paddle.com).
2. Crea un producto de tipo **One-time Purchase** con precio de **$18 USD**.
3. En el panel de desarrollador, copia tu `Product ID` y tu `Client Key / Public Token`.
4. Configura la variable de entorno en tu servidor o `.env`:
   ```env
   VITE_POLAR_PRODUCT_ID="tu_product_id_aqui"
   VITE_POLAR_PUBLIC_KEY="tu_public_key_aqui"
   ```
5. Polar o Paddle se encargarán automáticamente del cálculo de impuestos locales (IVA / VAT / Sales Tax) en más de 100 países y emitirán la clave de licencia automática al correo del usuario.

### B. Mercado Pago (Latinoamérica)
1. Ingresa a [Mercado Pago Developers](https://www.mercadopago.com/developers).
2. Genera tus credenciales de producción (`Public Key` y `Access Token`).
3. Para cobros en moneda local (ARS, MXN, COP, CLP, BRL), configura:
   ```env
   VITE_MERCADOPAGO_PUBLIC_KEY="tu_public_key_de_mp"
   ```
4. El webhook de Mercado Pago enviará una notificación `payment.created` con estado `approved`, activando la licencia mediante `RACION-PRO-XXXX`.

---

## 2. Cómo Editar y Añadir Nuevos Alimentos a la Base de Datos

La base de datos multi-marca se encuentra en `/src/data/foods.ts`. Para añadir un nuevo alimento:

```typescript
{
  id: 'marca-nombre-alimento',
  brand: 'Nombre de la Marca',
  name: 'Nombre comercial del producto',
  species: 'dog', // 'dog' o 'cat'
  lifeStage: 'adult', // 'puppy', 'kitten', 'adult', 'senior', o 'all'
  type: 'dry', // 'dry' (seco) o 'wet' (húmedo)
  kcalPerKg: 3850, // Energía metabolizable en kcal/kg según etiqueta
  kcalPerCup: 370, // Opcional: kcal por taza medidora
  proteinPct: 26.0, // % de proteína bruta garantizada
  fatPct: 15.0, // % de grasa cruda garantizada
  fiberPct: 2.5, // % de fibra cruda
  moisturePct: 9.0, // % de humedad
  country: 'País de origen',
  barcode: '7791234567890', // Código de barras EAN-13 para el escáner
  ingredientsSummary: 'Ingredientes principales...',
  score: 90, // Score educativo de 0 a 100 según rúbrica
  priceApproxUsd: 65,
  bagSizeKg: 15,
}
```
Además, los tutores pueden escanear el código de barras o subir una fotografía de la etiqueta nutricional directamente desde la app. La IA de etiquetas lee los macronutrientes y solicita confirmación antes de guardar.

---

## 3. Cómo Publicar la PWA (Progressive Web App)

Ración App ya cuenta con `vite-plugin-pwa`, `manifest.webmanifest`, soporte offline y registro de service worker.

### Despliegue en la Web:
1. Ejecuta el comando de compilación:
   ```bash
   npm run build
   ```
2. La carpeta `dist/` resultante contiene los activos estáticos listos para desplegarse en cualquier servicio (Vercel, Cloud Run, Firebase Hosting, Netlify o Cloudflare Pages).
3. Cualquier usuario en Chrome, Safari (iOS) o Android puede instalarla tocando el botón **"Instalar Ración App"** o desde el menú Compartir en Safari ("Agregar a pantalla de inicio").

### Empaquetado para Google Play (TWA - Trusted Web Activity):
1. Usa [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) de Google:
   ```bash
   npx @bubblewrap/cli init --manifest=https://tu-dominio.com/manifest.webmanifest
   npx @bubblewrap/cli build
   ```
2. Sube el archivo `.aab` generado a Google Play Console. No requiere cobro in-app porque se vende en la web a través de Merchant of Record.

### Empaquetado para Apple App Store:
1. Usa [Capacitor](https://capacitorjs.com/) o WKWebView nativo apuntando a la URL del PWA.

---

## 4. Decisiones de Seguridad Animal y Cumplimiento Legal

1. **Aviso Educativo Obligatorio**:
   Ración App se fundamenta en las guías científicas públicas del **NRC 2006**, **WSAVA** y **AAHA**. No diagnostica, no formula recetas terapéuticas caseras y no sustituye al médico veterinario.
2. **Pérdida de Peso Segura y Prevención de Lipidosis Hepática en Gatos**:
   Para animales con sobrepeso, el cálculo calórico se realiza estrictamente sobre el **peso ideal/objetivo**, nunca sobre el peso actual con sobrepeso. En felinos, el ritmo máximo recomendado es de 0.5% a 2% de su peso por semana, emitiendo una advertencia destacada contra las dietas relámpago o ayunos estrictos por riesgo fatal de lipidosis hepática.
3. **Módulo de Pauta Veterinaria con Bloqueo**:
   Si un animal presenta diabetes, pancreatitis, enfermedad renal u hospitalización, la app desactiva la generación libre de dietas y solicita la pauta calórica prescrita por el veterinario tratante, bloqueando el plan a esa indicación.
4. **Presupuesto de Premios**:
   Los premios nunca superan el 10% del requerimiento energético diario (MER) y se **restan** de la porción de alimento en lugar de sumarse por encima, evitando el sobrepeso encubierto.
