import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const embed = env.VITE_EMBED === '1';
  return {
    base: embed ? './' : env.VITE_BASE || '/',
    resolve: embed ? { alias: { 'virtual:pwa-register': '/src/lib/pwa-stub.js' } } : {},
    build: embed
      ? { outDir: 'dist-embed', assetsInlineLimit: 100000000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
      : {},
    plugins: [
      react(),
      !embed && VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: false,
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'], globIgnores: ['brand/**'] },
        manifest: {
          name: 'APEX — командный центр',
          short_name: 'APEX',
          description: 'Задачи, календарь, оплаты и посещаемость баскетбольного клуба APEX',
          lang: 'ru',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#111315',
          theme_color: '#111315',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Сегодня', url: './#/', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Новая задача', url: './#/tasks', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Внести оплату', url: './#/club?tab=payments&add=1', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
      }),
    ].filter(Boolean),
  };
});
