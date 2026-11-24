# Ración App

Ración App permite estimar la ración de perros y gatos y llevar un diario de comidas, compras y pesajes. La edición comercial ofrece acceso por un pago único de **25 USD** a través de Hotmart. Las raciones son estimaciones y no sustituyen la indicación de un veterinario.

## Ejecutar en local

Instala [Bun](https://bun.sh/) y [Node.js](https://nodejs.org/) 20.19 o 22.12 en adelante y ejecuta:

```sh
bun install
bun run dev
```

Abre [localhost:3000](http://localhost:3000). En el modo normal verás **Comprar** y **Ya compré**. Para probar únicamente el diario con perfiles locales, usa `RACION_LOCAL_MODE=anonymous-beta bun run dev`. Las comprobaciones del repositorio se ejecutan con `bun run lint` y `bun run test`.

## Compra y acceso con Hotmart

1. Configura en Hotmart el producto y la oferta de **pago único de 25 USD**. Obtén el enlace directo de pago en `pay.hotmart.com`, el identificador de producto y el código de oferta.
2. Habilita correo y contraseña en Firebase Authentication y configura los dominios autorizados para los enlaces de verificación y recuperación. Define `VITE_BILLING_API_URL` (origen del Worker), `VITE_BILLING_FIREBASE_PROJECT_ID` y `VITE_BILLING_FIREBASE_API_KEY` al compilar la aplicación. Las variables `VITE_*` son públicas.
3. En el Worker de `workers/billing`, configura `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS`, `HOTMART_CHECKOUT_URL`, `HOTMART_PRODUCT_ID` y `HOTMART_OFFER_CODE`. Guarda el Hottok en el secreto **HOTMART_HOTTOK** del Worker. Usa un Worker distinto para pruebas de envío desde el panel y para eventos de ventas reales.
4. En Hotmart registra el webhook HTTPS `/api/billing/webhook` del Worker para los eventos de compra v2. **Comprar** abre la oferta publicada. **Ya compré** permite ingresar con el correo de compra y verificar su titularidad. La aprobación activa el acceso. El acceso se comprueba de nuevo al volver a la app, y un reembolso o contracargo debe reflejarse para la compra correspondiente. [Eventos oficiales de Hotmart](https://developers.hotmart.com/docs/es/2.0.0/webhook/purchase-webhook/)
5. Para abrir ventas, comprueba el precio y la modalidad en la página de pago oficial y valida que una transacción de prueba del proveedor llegue a la cuenta correcta. Las pruebas automáticas usan transacciones ficticias y conservan el dinero fuera del recorrido.

## Actualizar la app y conservar el diario

Publica la actualización en el mismo origen que usaba el cliente. Al entrar por primera vez con su compra verificada, quien ya tenga datos en ese navegador puede elegir **Vincular mis datos anteriores**. Esta opción conserva sus mascotas, planes, registros y compras para esa cuenta. Los datos que ya estén vinculados se abren con la misma identidad. Un pago pendiente o una sesión cerrada no borra el diario.

El acceso del comprador se puede recuperar en otro dispositivo. El historial se guarda por navegador y dispositivo. En **Más → Ajustes y Privacidad → Exportar JSON** se puede descargar una copia con los registros y sus recibos.

## Publicar

Usa `bun run build:public` para compilar la versión comercial y sirve `dist/` con HTTPS. La compilación comprueba la oferta que anuncia el Worker y que el diario requiera una sesión. Para probar la PWA antes de actualizar un dominio, usa la prueba de actualización del workflow de GitHub Actions. En GitHub Pages el workflow configura la ruta base del repositorio. En Cloudflare Pages conserva la configuración de Firebase, compras y precios para el dominio que se publica.

Las vistas previas de las ramas `feature/` en Cloudflare muestran la entrada comercial. **Comprar** se habilita cuando el servicio de compras tiene configurada la oferta del productor.

La [revisión de Muse](https://muse.racion-app.pages.dev/) es un entorno privado de QA para probar el diario. Para actualizarlo, configura los secretos de Pages `MUSE_REVIEW_PASSWORD` y `MUSE_REVIEW_SIGNING_KEY` únicamente en **Previews**. Compila el commit con `GITHUB_SHA` y `VITE_PRICE_API_URL` definidos, ejecuta `bun run build:muse-review` y despliega `dist` en la rama **muse** del proyecto **racion-app**.

## Comparación de precios en Colombia

**Hoy → Comparar precios** abre la fórmula habitual. Desde el paso Alimento del asistente y desde **Alimentos → Buscar en internet**, elige **Comparar 2 kg con envío** (o el tamaño que necesites). Los dos recorridos consultan la misma fórmula y presentación. Puedes guardar el código postal de Bogotá en el comparador o en **Más → Ajustes y Privacidad**.

Cada tienda muestra el precio de la bolsa, la disponibilidad de ese empaque, el envío al destino y el total en COP. Solo puede ganar una oferta disponible cuyo total se pueda calcular. Si otra tienda tiene un precio de bolsa inferior y el envío está pendiente, el comparador identifica el **menor total confirmado**. Cambiar de destino requiere una nueva cotización.

El servicio de precios se ejecuta por separado en Cloudflare Workers. La configuración en `workers/live-prices/wrangler.toml` usa un Durable Object SQLite, disponible en Workers Free. Con una sesión de Wrangler autorizada en la cuenta de Cloudflare:

```sh
npx wrangler deploy --config workers/live-prices/wrangler.toml
npx wrangler secret put SERPAPI_API_KEY --config workers/live-prices/wrangler.toml
```

En GitHub, crea la variable de repositorio `PRICE_API_URL` en **Settings → Secrets and variables → Actions → Variables** con la URL HTTPS completa del Worker terminada en `/api/live-prices`. La siguiente compilación de Pages usa esa URL. Para probar el frontend en local con un Worker habilitado para ese origen, usa `VITE_PRICE_API_URL` en `.env.local`. `ALLOWED_ORIGINS` en Wrangler admite los orígenes autorizados separados por coma. La clave de SerpApi se guarda como secreto del Worker.

El servicio comparte resultados del mismo día para una fórmula, presentación y ciudad, y controla el consumo de consultas antes de llamar a Google Shopping. Los casos de envío desconocido, resultados anteriores y cuota agotada se verifican en CI con respuestas controladas.

## Alimentos y costo por toma

Al buscar un concentrado, el bloque **Alimentos de Agrocentro Pets** muestra las referencias publicadas en la tienda. Al elegir una presentación, la calculadora, el comparador y **Mis alimentos** reciben la ficha de esa fórmula. Cada nutriente indica su fuente, fecha, unidad y tipo de declaración. Las referencias que aún requieren una ficha permiten completar la información con la etiqueta de la bolsa.

Las [fichas de las casas comerciales](src/data/manufacturers) se verifican por fórmula, especie y referencia de Shopify y se distribuyen con la app. Los tamaños identifican si figuran en la ficha, en la tienda o en ambas. Las ofertas de los comercios se consultan en vivo y conservan el precio correspondiente a su empaque.

Hoy abre con los anillos de tomas y energía. Cada registro guarda los gramos servidos y consumidos, la composición disponible y el costo de ese momento. Una toma con energía desconocida cuenta en el diario y deja las calorías pendientes.

La búsqueda de alimentos para perros y gatos consulta Laia Pets, Puppis, Jumbo Colombia, Olímpica y Mercacentro. Conserva las presentaciones, el precio en COP y la fuente de cada tienda. Las fórmulas de cualquier marca pueden completarse desde una foto, texto copiado o la etiqueta escrita a mano. El análisis minorista requiere confirmación. Cuando hay una ficha identificable del fabricante se contrasta con la publicación de la tienda. Indica fuente, fecha y mínimos o máximos. La foto del empaque permite revisar los campos pendientes en el dispositivo. El perfil admite ingredientes a evitar y límites nutricionales veterinarios con unidad.

Para calcular la ración, tienen prioridad las kcal/kg confirmadas de la etiqueta. Si faltan y existe una tabla aplicable, el asistente propone el punto medio del intervalo y permite ajustarlo antes o después de guardar el plan. Para un perro adulto de 30 kg en mantenimiento con Agility Gold Grandes Adultos, Italcol indica 261–336 g al día. La propuesta es de 298,5 g al día, o 149,25 g en cada una de dos tomas. Las calorías por toma quedan pendientes hasta confirmar la energía del alimento. Si tampoco hay una tabla aplicable, se pueden registrar los gramos habituales como pendientes de confirmar. [Tabla de alimentación de Italcol](https://www.italcolmascotas.com/agility-gold-grandes-adultos-2/)

El botón **Buscar también en el registro del ICA** consulta el PDF enlazado en el [listado oficial colombiano](https://www.ica.gov.co/areas/pecuaria/servicios/alimentos-para-animales/listado-de-alimentos-para-animales-registrados) y busca por nombre o número de registro para la especie seleccionada. Permite identificar un alimento aunque falte en las tiendas. Los datos nutricionales, el empaque y el precio se obtienen de la ficha, etiqueta u oferta correspondiente. Ambas consultas usan fuentes públicas y funcionan sin clave de SerpApi.

En **Gastos**, registra la compra una vez y selecciona las mascotas que comen de la bolsa al guardar su apertura. Si sus planes usan esa fórmula y presentación, cada perfil aplica el mismo precio por gramo a su propia ración para calcular el costo por toma, día y mes. El mes estimado equivale a 30,5 días. El desembolso se contabiliza una sola vez, en el perfil que registró la compra. El inventario descuenta cada toma registrada una vez y estima la fecha de reposición con las raciones actuales.

Elegir un empaque conserva la fórmula, tamaño, imagen, fuente y precio observado de esa variante. La energía y los nutrientes ausentes permanecen pendientes de la etiqueta. Al usar la ficha en el plan, el diario, Ajustar y el comparador comparten esa selección. Cambiar de fórmula o presentación invalida cualquier precio que no corresponda al nuevo alimento.

En el comparador, **Usar precio del producto** o **Usar total con envío** abre una vista previa del nuevo costo por toma. Aplicar confirma el cambio para la mascota seleccionada. Se conserva la tienda, fecha, URL y código postal de la cotización. En **Gastos** se puede registrar el precio pagado, la cantidad y el peso de los empaques, o elegir **Leer factura (foto o PDF)** para extraerlos automáticamente.

La lectura de fotos usa Tesseract.js en español e inglés. Los PDF digitales se leen con PDF.js y las páginas escaneadas pasan por OCR. Todo se procesa en el navegador; los archivos de soporte se sirven desde el mismo dominio y se descargan al usar el lector. La factura y su texto no se envían a servicios externos. Se admiten documentos de hasta 15 MB y PDF de hasta cinco páginas.

La revisión de la factura muestra el alimento, el peso de cada empaque, la cantidad, el importe, la fecha y la tienda. Si hay un único alimento y el total se le puede atribuir sin cargos adicionales, la app propone el total de la factura. Con varios artículos, usa el importe de la línea elegida. Las fechas futuras o ambiguas quedan pendientes para corregirlas con el documento a la vista.

El lector reconoce pesos con coma o punto decimal y los contrasta con las presentaciones conocidas de la fórmula. Si la compra indica 15 kg y el plan utiliza 1,5 kg, el usuario debe verificar explícitamente ese peso antes de guardar. La revisión también muestra el costo por toma. Por ejemplo, dos bolsas de 1,5 kg por $90.000 COP cuestan $30 por gramo y $4.500 por una toma de 150 g. El usuario confirma el alimento y los valores antes de registrar la compra.

Cuando una compra usa un tamaño distinto del plan, **Usar este empaque en mi plan** permite confirmar ese cambio por separado. Se conservan la fórmula, su etiqueta, las raciones y los horarios. Las fotos de facturas se guardan como imágenes comprimidas. Los nuevos PDF se conservan completos en este navegador. **Ver recibo** permite recorrer sus páginas y descargar el archivo. Si el PDF se adjuntó en una versión anterior, se muestra la imagen de la primera página que se guardó entonces. La copia JSON incluye los comprobantes. El texto OCR completo se descarta después de la revisión. Los motores utilizados son [Tesseract.js](https://github.com/naptha/tesseract.js) y [PDF.js](https://mozilla.github.io/pdf.js/), con sus avisos de licencia en `ocr/licenses/`.

El costo se calcula sin redondeos intermedios: `importe / gramos comprados × gramos de la toma`. Las compras se asocian a la mascota, fórmula y presentación. La alimentación mixta suma cada componente con su propio precio y señala los totales parciales si falta un dato. Una cotización no se registra como compra pagada. Las fichas antiguas continúan siendo compatibles con los planes ya guardados.
