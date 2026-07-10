import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production, the SPA lives at grantequity.org/_app/ (assets prefixed /_app/)
// and Vercel rewrites /login, /matches*, /profile → /_app/index.html.
// In dev, base is / so the local server works normally at 127.0.0.1:5173.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/_app/' : '/',
  build: {
    outDir: '../../grant_equity/_app',
    emptyOutDir: true,
  },
  server: { port: 5173, host: '127.0.0.1' },
}));
