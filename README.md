# Ración App

Beta gratuita para estimar la ración de perros y gatos, registrar tomas y pesajes y consultar su historial. Los visitantes pueden usarla sin cuenta, licencia ni cobros. Las raciones son estimaciones y no sustituyen la indicación de un veterinario.

## Ejecutar en local

Instala [Bun](https://bun.sh/) y [Node.js](https://nodejs.org/) 20.19 o 22.12 en adelante:

```sh
bun install
bun run dev
```

Abre [localhost:3000](http://localhost:3000). Para comprobar la compilación y verla en el navegador:

```sh
bun run lint
bun run test
bun run build
bun run preview
```

## Publicar la beta

Cada cambio en `main` actualiza la beta en Cloudflare Pages. [Abrir Ración App](https://racion-app.pages.dev/).

Para publicarla en otro sitio, sirve `dist/` como contenido estático en un dominio con HTTPS. El diario funciona en el navegador. Si tu alojamiento usa el servidor incluido, ejecuta `NODE_ENV=production bun run start` después de compilar. El puerto por defecto es 3000 y se puede cambiar con la variable de entorno `PORT`.

La aplicación guarda perfiles, planes, compras y registros en el almacenamiento local del navegador. Los datos no se sincronizan entre dispositivos; cambiar de navegador, dominio o borrar sus datos deja esos registros fuera de alcance. En **Más → Ajustes y Privacidad → Exportar JSON** puedes descargar una copia de tus datos. Tras la primera carga en producción, la PWA guarda los recursos principales para que el diario y las fichas personales estén disponibles sin conexión. Buscar productos y actualizar precios requiere internet.

## Comparación de precios en Colombia

**Hoy → Comparar precios** abre la fórmula habitual. El comparador muestra ofertas de la misma presentación y separa otros tamaños por precio del producto por kilo. El ganador del día requiere un total con envío informado. La fecha corresponde a la consulta de Google Shopping.

El servicio de precios se ejecuta por separado en Cloudflare Workers. La configuración en `workers/live-prices/wrangler.toml` usa un Durable Object SQLite, disponible en Workers Free. Con una sesión de Wrangler autorizada en la cuenta de Cloudflare:

```sh
npx wrangler deploy --config workers/live-prices/wrangler.toml
npx wrangler secret put SERPAPI_API_KEY --config workers/live-prices/wrangler.toml
```

En GitHub, crea la variable de repositorio `PRICE_API_URL` en **Settings → Secrets and variables → Actions → Variables** con la URL HTTPS completa del Worker terminada en `/api/live-prices`. La siguiente compilación de Pages usa esa URL. Para probar el frontend en local con un Worker habilitado para ese origen, usa `VITE_PRICE_API_URL` en `.env.local`. `ALLOWED_ORIGINS` en Wrangler admite los orígenes autorizados separados por coma. La clave de SerpApi se guarda como secreto del Worker.

El servicio comparte resultados del mismo día para una fórmula, presentación y ciudad, y controla el consumo de consultas antes de llamar a Google Shopping. Los casos de envío desconocido, resultados anteriores y cuota agotada se verifican en CI con respuestas controladas.

## Alimentos y costo por toma

El buscador abre **Internet** y consulta los productos y presentaciones del catálogo público de Laia Pets. Un enlace permite ampliar la búsqueda en la web. **Mis alimentos** conserva las fichas que el usuario ha revisado. No se presenta un catálogo precargado como resultado de una consulta en internet.

Elegir un empaque conserva la fórmula, tamaño, imagen, fuente y precio observado de esa variante. La energía y los nutrientes ausentes permanecen pendientes de la etiqueta. Al usar la ficha en el plan, el diario, Ajustar y el comparador comparten esa selección. Cambiar de fórmula o presentación invalida cualquier precio que no corresponda al nuevo alimento.

En el comparador, **Usar precio del producto** o **Usar total con envío** actualiza la referencia de costo del plan. Se conserva la tienda, fecha, URL y código postal de la cotización. En **Gastos** se puede registrar el precio pagado, la cantidad y el peso de los empaques, y adjuntar una foto de la factura. La foto es un comprobante adjunto; el usuario confirma el importe, no se realiza OCR automático.

El costo se calcula sin redondeos intermedios: `importe / gramos comprados × gramos de la toma`. Las compras se asocian a la mascota, fórmula y presentación. La alimentación mixta suma cada componente con su propio precio y señala los totales parciales si falta un dato. Una cotización no se registra como compra pagada. Las fichas antiguas continúan siendo compatibles con los planes ya guardados.
