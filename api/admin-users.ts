// Vercel serverless function: POST /api/admin-users
// Needs SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL or SUPABASE_URL) in
// the Vercel project's environment variables. Logic lives in server/adminUsers.ts.
import { handleWithEnv } from '../server/adminUsers.js';

declare const process: { env: Record<string, string | undefined> };

export async function POST(request: Request): Promise<Response> {
  return handleWithEnv(request, process.env);
}
