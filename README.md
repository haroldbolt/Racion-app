# Ración App

Ración App permite estimar la ración de perros y gatos, registrar tomas y pesajes y consultar su historial. La oferta prevista para Muse incluye registro, 72 horas de prueba gratuita y un único cobro de 18 USD al cuarto día, sin renovación. El procedimiento de publicación describe cómo validarla en Hotmart. Las raciones son estimaciones y no sustituyen la indicación de un veterinario.

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

## R0 · Prueba histórica de registro y cobro con Stripe Sandbox

La compilación estándar de esta rama abre el registro. La edición pública anterior se compila de forma explícita con `--mode anonymous-beta`. La nueva edición requiere una conexión para verificar la cuenta al abrirla. Los diarios siguen en el navegador y su vinculación requiere la confirmación del titular del dispositivo.

1. Habilita correo y contraseña en un proyecto Firebase Authentication de pruebas. En el frontend configura `VITE_BILLING_FIREBASE_PROJECT_ID`, `VITE_BILLING_FIREBASE_API_KEY` y `VITE_BILLING_API_URL` con el origen del Worker de pruebas. La configuración pública de Firebase se obtiene de su aplicación web.
2. En el Worker `workers/billing`, configura `FIREBASE_PROJECT_ID` con el mismo proyecto y `ALLOWED_ORIGINS` con la URL completa del frontend de pruebas, incluida la ruta de regreso. Guarda `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` exclusivamente como secretos del Worker. Se admiten claves de sandbox. El webhook es `/api/billing/webhook` para los eventos `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed` y `payment_intent.processing`.
3. Ejecuta `bun run dev` para la interfaz o `bun run build` para generar sus archivos. El registro abre Stripe Checkout. Después de confirmar el método, cada cuenta tiene un vencimiento persistente a las 72 horas. El Worker programa un solo cargo de 1.800 centavos USD. La cancelación se hace desde **Mi cuenta**.
4. Para repetir la prueba con la API de Stripe, carga una clave de pruebas en el entorno y ejecuta `node --import tsx scripts/verify-billing-sandbox.ts --api-setup`. El modo `--hosted` permite registrar el método directamente en dos formularios de Stripe Checkout. Ambos verifican los cargos del sandbox con su API. El reloj acelerado pertenece al ejecutor de pruebas. La verificación en Chrome usa el emulador oficial de Firebase Authentication y una pasarela de pagos controlada. También comprueba inventario, costos y pesajes después de recargar.

## Publicar la beta

La [revisión de Muse](https://muse.racion-app.pages.dev/) permite probar R1–R5 con la invitación de pruebas, sin tarjeta ni cobros. El dominio [racion-app.pages.dev](https://racion-app.pages.dev/) corresponde a la beta anterior. El lanzamiento comercial de R0 queda pendiente de integrar y probar la oferta de Hotmart.

Para actualizar la revisión, configura los secretos de Pages `MUSE_REVIEW_PASSWORD` y `MUSE_REVIEW_SIGNING_KEY` únicamente en **Previews**. Compila el commit que vas a publicar con `GITHUB_SHA` y `VITE_PRICE_API_URL` definidos, ejecuta `bun run build:muse-review` y despliega `dist` en la rama **muse** del proyecto de Cloudflare Pages **racion-app**. La prueba en GitHub Actions abre esa misma versión con una credencial temporal, recarga la app y conserva capturas de los cuatro recorridos. El nombre de usuario de la invitación es `muse`.

Para publicarla en otro sitio, sirve `dist/` como contenido estático en un dominio con HTTPS. El diario funciona en el navegador. Si tu alojamiento usa el servidor incluido, ejecuta `NODE_ENV=production bun run start` después de compilar. El puerto por defecto es 3000 y se puede cambiar con la variable de entorno `PORT`.

La aplicación guarda perfiles, planes, compras y registros en el almacenamiento local del navegador. Los datos no se sincronizan entre dispositivos; cambiar de navegador, dominio o borrar sus datos deja esos registros fuera de alcance. En **Más → Ajustes y Privacidad → Exportar JSON** puedes descargar una copia de tus datos. Tras la primera carga en producción, la PWA guarda los recursos principales para que el diario y las fichas personales estén disponibles sin conexión. Buscar productos y actualizar precios requiere internet.

### Hotmart · Configurar y probar la oferta de Muse

1. **Preparar la oferta.** En Hotmart abre **Productos → Mis productos → Crear producto → Suscripción**. En **Fijación de precio → Nuevo plan**, fija **18 USD**, modalidad de prueba **Gratis**, **3 días** y **número máximo de cobros = 1**. Vuelve a abrir la oferta y comprueba que muestre esos valores. La ayuda documenta la cancelación automática al llegar al máximo y deja sin especificar el mínimo que acepta el formulario. Si rechaza el valor 1, conserva la oferta en borrador y solicita a soporte una modalidad de cobro único diferido. [Configuración de planes](https://suportehotmart.zendesk.com/hc/es-es/articles/360060619412--C%C3%B3mo-crear-y-configurar-planes-de-suscripci%C3%B3n-y-cupones-de-descuento) · [Condiciones de la prueba, sección 5.1](https://hotmart.com/es/legal/plazo-de-compra)
2. **Preparar el entorno de pruebas.** Usa un Worker de pruebas y datos ficticios. En Hotmart selecciona **Herramientas → Credenciales de desarrollador → Sandbox**. Guarda las credenciales OAuth y el token privado del webhook (Hottok) como secretos del Worker. Los valores `VITE_*` se distribuyen al navegador. [Credenciales](https://developers.hotmart.com/docs/en/start/app-auth) · [Alcance del sandbox](https://developers.hotmart.com/docs/es/start/about/)
3. **Probar la notificación.** Apunta el webhook de pruebas al Worker de pruebas. En **Herramientas → Webhook → Configuraciones** ejecuta una prueba de envío y revisa el historial. El receptor debe verificar `X-HOTMART-HOTTOK`, producto, oferta, moneda e importe, y aplicar cada transacción aprobada una sola vez. Esta prueba acredita la recepción del mensaje. [Prueba de envío](https://suportehotmart.zendesk.com/hc/es-es/articles/360001491352--C%C3%B3mo-configuro-la-API-de-mi-producto-usando-el-Webhook-Postback) · [Eventos de compra](https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/)
4. **Probar el cobro antes de activar la oferta.** Usa un recorrido de compra que Hotmart identifique como de pruebas. Con una cuenta ficticia, cancela desde la app antes de las 72 horas y comprueba en Hotmart la cancelación y cero cargos tras el vencimiento. Con otra, registra la hora de inicio y verifica en Hotmart un único cargo aprobado de 18 USD al cuarto día, sin otro pago programado. Recarga la app en ambas cuentas y comprueba el acceso correspondiente. Si el sandbox solo entrega datos de muestra o carece de un flujo de compra para esa oferta, deja el cobro pendiente de validar y pide a Hotmart una prueba de extremo a extremo sin dinero real.

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
