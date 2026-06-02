import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This React test version uses Supabase. The production /radio/ page remains unchanged.
// GitHub Pages serves this app as static files, so runtime config is read from
// radio/react/config.js instead of Vite build-time environment variables.
const getRuntimeConfig = () => window.STASHBOX_SUPABASE_CONFIG || {};

export const SUPABASE_TABLES = {
  songs: 'songs',
  products: 'products',
  songProducts: 'song_products',
  songLikes: 'song_likes',
  songPlayEvents: 'song_play_events',
  songShareEvents: 'song_share_events',
  songShareCounts: 'song_share_counts',
  productClickEvents: 'product_click_events'
};

export const SUPABASE_REQUIRED_CONFIG_KEYS = [
  'url',
  'anonKey'
];

export function createRadioSupabaseClient() {
  const config = getRuntimeConfig();
  const supabaseUrl = String(config.url || '').trim();
  const supabaseAnonKey = String(config.anonKey || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Edit radio/react/config.js and set window.STASHBOX_SUPABASE_CONFIG.url and window.STASHBOX_SUPABASE_CONFIG.anonKey.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
