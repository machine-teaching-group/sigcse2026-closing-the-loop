import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  return {
    plugins: [react()],
    // In dev, serve at root so `npm run dev` keeps working; in prod, serve under Django static URL
    base: isDev ? '/' : (process.env.VITE_BASE || '/static/student/'),
    build: {
      outDir: resolve(__dirname, '../backend_orchestration/frontend_build/student'),
      emptyOutDir: true,
    },
  };
});
