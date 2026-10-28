import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const nextcloud = process.env.NC_URL ?? 'https://cloud.example.org';

export default defineConfig({
  base: '/ui/',
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  server: {
    proxy: {
      '/remote.php': { target: nextcloud, changeOrigin: true },
      '/index.php': { target: nextcloud, changeOrigin: true },
      '/login': { target: nextcloud, changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
  },
});
