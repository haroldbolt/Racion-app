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

Hoy abre con los anillos de tomas y energía. Cada registro guarda los gramos servidos y consumidos, la composición disponible y el costo de ese momento. Una toma con energía desconocida cuenta en el diario y deja las calorías pendientes.

La búsqueda de alimentos para perros y gatos consulta Laia Pets, Puppis, Jumbo Colombia, Olímpica y Mercacentro. Conserva las presentaciones, el precio en COP y la fuente de cada tienda. Las fórmulas de cualquier marca pueden completarse desde una foto, texto copiado o la etiqueta escrita a mano. El análisis minorista requiere confirmación. Cuando hay una ficha identificable del fabricante se contrasta con la publicación de la tienda. Indica fuente, fecha y mínimos o máximos. Para Agility Gold Grandes Adultos importa el análisis y la tabla de suministro de Italcol. En mantenimiento se pueden confirmar gramos dentro del intervalo publicado para el peso de la mascota. La foto del empaque permite revisar los campos pendientes en el dispositivo. El perfil admite ingredientes a evitar y límites nutricionales veterinarios con unidad.

El botón **Buscar también en el registro del ICA** consulta el PDF enlazado en el [listado oficial colombiano](https://www.ica.gov.co/areas/pecuaria/servicios/alimentos-para-animales/listado-de-alimentos-para-animales-registrados) y busca por nombre o número de registro para la especie seleccionada. Permite identificar un alimento aunque falte en las tiendas. Los datos nutricionales, el empaque y el precio se obtienen de la ficha, etiqueta u oferta correspondiente. Ambas consultas usan fuentes públicas y funcionan sin clave de SerpApi.

En Gastos se registra la apertura de la compra y las mascotas que comparten el alimento. El inventario descuenta cada toma registrada una vez y estima la fecha de reposición con las raciones actuales.

Elegir un empaque conserva la fórmula, tamaño, imagen, fuente y precio observado de esa variante. La energía y los nutrientes ausentes permanecen pendientes de la etiqueta. Al usar la ficha en el plan, el diario, Ajustar y el comparador comparten esa selección. Cambiar de fórmula o presentación invalida cualquier precio que no corresponda al nuevo alimento.

En el comparador, **Usar precio del producto** o **Usar total con envío** abre una vista previa del nuevo costo por toma. Aplicar confirma el cambio para la mascota seleccionada. Se conserva la tienda, fecha, URL y código postal de la cotización. En **Gastos** se puede registrar el precio pagado, la cantidad y el peso de los empaques, o elegir **Leer factura (foto o PDF)** para extraerlos automáticamente.

La lectura de fotos usa Tesseract.js en español e inglés. Los PDF digitales se leen con PDF.js y las páginas escaneadas pasan por OCR. Todo se procesa en el navegador; los archivos de soporte se sirven desde el mismo dominio y se descargan al usar el lector. La factura y su texto no se envían a servicios externos. Se admiten documentos de hasta 15 MB y PDF de hasta cinco páginas.

La pantalla de revisión permite elegir la línea del alimento, consultar el texto reconocido y corregir importe, cantidad y peso. Los datos ausentes o ambiguos quedan pendientes; el total general, los envíos y los otros artículos no se asignan al alimento. El costo por toma se muestra antes de guardar. El usuario debe confirmar la asociación al alimento y los valores; la lectura por sí sola nunca registra una compra. Si falla o se cancela, sigue disponible el ingreso manual.

Cuando una compra usa un tamaño distinto del plan, **Usar este empaque en mi plan** permite confirmar ese cambio por separado. Se conservan la fórmula, su etiqueta, las raciones y los horarios. El comprobante se guarda como una imagen comprimida; en PDF se conserva la vista previa de la primera página. No se almacena el texto OCR completo. Los motores utilizados son [Tesseract.js](https://github.com/naptha/tesseract.js) y [PDF.js](https://mozilla.github.io/pdf.js/), con sus avisos de licencia en `ocr/licenses/`.

El costo se calcula sin redondeos intermedios: `importe / gramos comprados × gramos de la toma`. Las compras se asocian a la mascota, fórmula y presentación. La alimentación mixta suma cada componente con su propio precio y señala los totales parciales si falta un dato. Una cotización no se registra como compra pagada. Las fichas antiguas continúan siendo compatibles con los planes ya guardados.
