import { createClient } from '@supabase/supabase-js';

const isDev = import.meta.env.DEV;
const prodUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = isDev ? 'http://localhost:5173/supabase' : prodUrl;

if (!prodUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder-key'
);
