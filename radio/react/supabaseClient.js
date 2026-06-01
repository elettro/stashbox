import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This React test version uses Supabase. The production /radio/ page remains unchanged.
const env = import.meta.env || {};

export const SUPABASE_TABLES = {
  songs: 'songs',
  products: 'products',
  songProducts: 'song_products'
};

export const SUPABASE_REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

export function createRadioSupabaseClient() {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for /radio/react/.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
