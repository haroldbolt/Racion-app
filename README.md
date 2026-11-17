# Ración App

Beta gratuita para estimar la ración de perros y gatos, registrar tomas y pesajes y consultar su historial. Funciona sin cuenta, licencia, claves de API ni cobros. Las raciones son estimaciones y no sustituyen la indicación de un veterinario.

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

Publica `dist/` como sitio estático en la raíz de un dominio con HTTPS. No necesita backend. Si tu alojamiento usa el servidor incluido, ejecuta `NODE_ENV=production bun run start` después de compilar. El puerto por defecto es 3000 y se puede cambiar con la variable de entorno `PORT`.

La aplicación guarda perfiles, planes y registros en el almacenamiento local del navegador. Los datos no se sincronizan entre dispositivos; cambiar de navegador, dominio o borrar sus datos deja esos registros fuera de alcance. En **Más → Ajustes y Privacidad → Exportar JSON** puedes descargar una copia de tus datos. Tras la primera carga en producción, la PWA guarda los recursos principales para que el diario y el catálogo local estén disponibles sin conexión.

La beta no incluye servicios de cuentas, cobro, sincronización, precios en vivo ni análisis de etiquetas por IA.

## Catálogo

Las fichas locales están en `src/data/foods.ts` y el catálogo adicional en `public/assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json`. Al ampliar una ficha, registra las kcal/kg y su fuente cuando estén disponibles en la etiqueta; evita rellenar valores que no estén declarados.
