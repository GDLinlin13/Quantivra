import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/supabase': {
        target: 'https://zxutyxqyvfnadbdabwvf.supabase.co',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/supabase/, ''),
      },
    },
  },
});
