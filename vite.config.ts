import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'Ración App',
          short_name: 'Ración App',
          description: 'Estima la ración de tu perro o gato y lleva su diario de tomas y pesajes.',
          theme_color: '#0B5D2E',
          background_color: '#EAF4EC',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,ico,woff,woff2}',
            'assets/food_*',
            'assets/aistudio/Racio_n_App__Nutricio_n_con_carin_o_8fb59a2d.png',
            'assets/aistudio/Catalogo_Alimentos_Racion_App_68a4174d.json',
          ],
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
