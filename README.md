# Ración App

La beta pública permite estimar la ración de perros y gatos, registrar tomas y pesajes y consultar su historial. Los visitantes pueden usarla sin cuenta, licencia ni cobros. Las raciones son estimaciones y no sustituyen la indicación de un veterinario.

## Ejecutar en local

Instala [Bun](https://bun.sh/) y [Node.js](https://nodejs.org/) 20.19 o 22.12 en adelante:

```sh
bun install
RACION_LOCAL_MODE=anonymous-beta bun run dev
```

Abre [localhost:3000](http://localhost:3000). Para comprobar la compilación y verla en el navegador:

```sh
bun run lint
bun run test
bun run build --mode anonymous-beta
bun run preview
```

## R0 · Registro y cobro único en pruebas

La compilación estándar de esta rama abre el registro. La edición pública anterior se compila de forma explícita con `--mode anonymous-beta`. La nueva edición requiere una conexión para verificar la cuenta al abrirla. Los diarios siguen en el navegador y su vinculación requiere la confirmación del titular del dispositivo.

1. Habilita correo y contraseña en un proyecto Firebase Authentication de pruebas. En el frontend configura `VITE_BILLING_FIREBASE_PROJECT_ID`, `VITE_BILLING_FIREBASE_API_KEY` y `VITE_BILLING_API_URL` con el origen del Worker de pruebas. La configuración pública de Firebase se obtiene de su aplicación web.
2. En el Worker `workers/billing`, configura `FIREBASE_PROJECT_ID` con el mismo proyecto y `ALLOWED_ORIGINS` con la URL completa del frontend de pruebas, incluida la ruta de regreso. Guarda `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` exclusivamente como secretos del Worker. Se admiten claves de sandbox. El webhook es `/api/billing/webhook` para los eventos `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed` y `payment_intent.processing`.
3. Ejecuta `bun run dev` para la interfaz o `bun run build` para generar sus archivos. El registro abre Stripe Checkout. Después de confirmar el método, cada cuenta tiene un vencimiento persistente a las 72 horas. El Worker programa un solo cargo de 1.800 centavos USD. La cancelación se hace desde **Mi cuenta**.
4. Para repetir la prueba con la API de Stripe, carga una clave de pruebas en el entorno y ejecuta `node --import tsx scripts/verify-billing-sandbox.ts --api-setup`. El modo `--hosted` permite registrar el método directamente en dos formularios de Stripe Checkout. Ambos verifican los cargos del sandbox con su API. El reloj acelerado pertenece al ejecutor de pruebas. La verificación en Chrome usa el emulador oficial de Firebase Authentication y una pasarela de pagos controlada. También comprueba inventario, costos y pesajes después de recargar.

## Publicar la beta

Cada cambio en `main` actualiza la beta en Cloudflare Pages. [Abrir Ración App](https://racion-app.pages.dev/).

Para publicarla en otro sitio, sirve `dist/` como contenido estático en un dominio con HTTPS. El diario funciona en el navegador. Si tu alojamiento usa el servidor incluido, ejecuta `NODE_ENV=production bun run start` después de compilar. El puerto por defecto es 3000 y se puede cambiar con la variable de entorno `PORT`.

La aplicación guarda perfiles, planes, compras y registros en el almacenamiento local del navegador. Los datos no se sincronizan entre dispositivos; cambiar de navegador, dominio o borrar sus datos deja esos registros fuera de alcance. En **Más → Ajustes y Privacidad → Exportar JSON** puedes descargar una copia de tus datos. Tras la primera carga en producción, la PWA guarda los recursos principales para que el diario y las fichas personales estén disponibles sin conexión. Buscar productos y actualizar precios requiere internet.

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

En Gastos se registra la apertura de la compra y las mascotas que comparten el alimento. El inventario descuenta cada toma registrada una vez y estima la fecha de reposición con las raciones actuales.

Elegir un empaque conserva la fórmula, tamaño, imagen, fuente y precio observado de esa variante. La energía y los nutrientes ausentes permanecen pendientes de la etiqueta. Al usar la ficha en el plan, el diario, Ajustar y el comparador comparten esa selección. Cambiar de fórmula o presentación invalida cualquier precio que no corresponda al nuevo alimento.

En el comparador, **Usar precio del producto** o **Usar total con envío** abre una vista previa del nuevo costo por toma. Aplicar confirma el cambio para la mascota seleccionada. Se conserva la tienda, fecha, URL y código postal de la cotización. En **Gastos** se puede registrar el precio pagado, la cantidad y el peso de los empaques, o elegir **Leer factura (foto o PDF)** para extraerlos automáticamente.

La lectura de fotos usa Tesseract.js en español e inglés. Los PDF digitales se leen con PDF.js y las páginas escaneadas pasan por OCR. Todo se procesa en el navegador; los archivos de soporte se sirven desde el mismo dominio y se descargan al usar el lector. La factura y su texto no se envían a servicios externos. Se admiten documentos de hasta 15 MB y PDF de hasta cinco páginas.

La revisión de la factura muestra el alimento, el peso de cada empaque, la cantidad, el importe, la fecha y la tienda. Si hay un único alimento y el total se le puede atribuir sin cargos adicionales, la app propone el total de la factura. Con varios artículos, usa el importe de la línea elegida. Las fechas futuras o ambiguas quedan pendientes para corregirlas con el documento a la vista.

El lector reconoce pesos con coma o punto decimal y los contrasta con las presentaciones conocidas de la fórmula. Si la compra indica 15 kg y el plan utiliza 1,5 kg, el usuario debe verificar explícitamente ese peso antes de guardar. La revisión también muestra el costo por toma. Por ejemplo, dos bolsas de 1,5 kg por $90.000 COP cuestan $30 por gramo y $4.500 por una toma de 150 g. El usuario confirma el alimento y los valores antes de registrar la compra.

Cuando una compra usa un tamaño distinto del plan, **Usar este empaque en mi plan** permite confirmar ese cambio por separado. Se conservan la fórmula, su etiqueta, las raciones y los horarios. El comprobante se guarda como una imagen comprimida; en PDF se conserva la vista previa de la primera página. No se almacena el texto OCR completo. Los motores utilizados son [Tesseract.js](https://github.com/naptha/tesseract.js) y [PDF.js](https://mozilla.github.io/pdf.js/), con sus avisos de licencia en `ocr/licenses/`.

El costo se calcula sin redondeos intermedios: `importe / gramos comprados × gramos de la toma`. Las compras se asocian a la mascota, fórmula y presentación. La alimentación mixta suma cada componente con su propio precio y señala los totales parciales si falta un dato. Una cotización no se registra como compra pagada. Las fichas antiguas continúan siendo compatibles con los planes ya guardados.
