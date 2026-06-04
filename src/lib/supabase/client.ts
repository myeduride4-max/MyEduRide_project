import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
