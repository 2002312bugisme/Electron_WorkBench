import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['archiver', 'unzipper', 'better-sqlite3-multiple-ciphers'],
    },
  },
});
