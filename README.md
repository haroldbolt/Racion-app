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

Para publicarla en otro sitio, sirve `dist/` como contenido estático en un dominio con HTTPS. El diario y el catálogo funcionan en el navegador. Si tu alojamiento usa el servidor incluido, ejecuta `NODE_ENV=production bun run start` después de compilar. El puerto por defecto es 3000 y se puede cambiar con la variable de entorno `PORT`.

La aplicación guarda perfiles, planes y registros en el almacenamiento local del navegador. Los datos no se sincronizan entre dispositivos; cambiar de navegador, dominio o borrar sus datos deja esos registros fuera de alcance. En **Más → Ajustes y Privacidad → Exportar JSON** puedes descargar una copia de tus datos. Tras la primera carga en producción, la PWA guarda los recursos principales para que el diario y el catálogo local estén disponibles sin conexión.

## Comparación de precios en Colombia

**Hoy → Comparar precios** abre la fórmula habitual. El comparador muestra ofertas de la misma presentación y separa otros tamaños por precio del producto por kilo. El ganador del día requiere un total con envío informado. La fecha corresponde a la consulta de Google Shopping.

El servicio de precios se ejecuta por separado en Cloudflare Workers. La configuración en `workers/live-prices/wrangler.toml` usa un Durable Object SQLite, disponible en Workers Free. Con una sesión de Wrangler autorizada en la cuenta de Cloudflare:

```sh
npx wrangler deploy --config workers/live-prices/wrangler.toml
npx wrangler secret put SERPAPI_API_KEY --config workers/live-prices/wrangler.toml
```

En GitHub, crea la variable de repositorio `PRICE_API_URL` en **Settings → Secrets and variables → Actions → Variables** con la URL HTTPS completa del Worker terminada en `/api/live-prices`. La siguiente compilación de Pages usa esa URL. Para probar el frontend en local con un Worker habilitado para ese origen, usa `VITE_PRICE_API_URL` en `.env.local`. `ALLOWED_ORIGINS` en Wrangler admite los orígenes autorizados separados por coma. La clave de SerpApi se guarda como secreto del Worker.

El servicio comparte resultados del mismo día para una fórmula, presentación y ciudad, y controla el consumo de consultas antes de llamar a Google Shopping. Los casos de envío desconocido, resultados anteriores y cuota agotada se verifican en CI con respuestas controladas.

## Catálogo

Las fichas locales están en `src/data/foods.ts` y el catálogo adicional en `public/assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json`. Al ampliar una ficha, registra las kcal/kg y su fuente cuando estén disponibles en la etiqueta; evita rellenar valores que no estén declarados.
