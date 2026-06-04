import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cube-assets/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
