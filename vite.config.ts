import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// In `npm run dev`, serve /api/admin-users locally with the same code the
// Vercel function runs in production (server/adminUsers.ts). Needs
// SUPABASE_SERVICE_ROLE_KEY in your local .env (never prefix it with VITE_).
function adminUsersDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'quantivra-admin-users-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/admin-users', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const request = new Request(`http://localhost${req.url || ''}`, {
          method: req.method, headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const mod = await server.ssrLoadModule('/server/adminUsers.ts');
        const response: Response = await mod.handleWithEnv(request, env);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), adminUsersDevApi(env)],
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
  };
});
