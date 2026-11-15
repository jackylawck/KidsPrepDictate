import { defineConfig } from 'vite';

export default defineConfig({
  base: '/KidsPrepDictate/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
