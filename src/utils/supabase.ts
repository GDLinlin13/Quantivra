import { createClient } from '@supabase/supabase-js';

const isDev = import.meta.env.DEV;
const prodUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = isDev ? 'http://localhost:5173/supabase' : prodUrl;

if (!prodUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

// "Remember me": keep the sign-in across browser restarts (localStorage) or
// only for this tab (sessionStorage). The choice is made before signing in.
const REMEMBER_KEY = 'qv_remember';
export function setRememberMe(remember: boolean) {
  try { remember ? localStorage.setItem(REMEMBER_KEY, '1') : localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
}
const authStorage = {
  getItem(key: string) {
    try { return localStorage.getItem(key) ?? sessionStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    try {
      const remember = localStorage.getItem(REMEMBER_KEY) === '1';
      (remember ? localStorage : sessionStorage).setItem(key, value);
      (remember ? sessionStorage : localStorage).removeItem(key);
    } catch { /* ignore */ }
  },
  removeItem(key: string) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder-key',
  { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } },
);
