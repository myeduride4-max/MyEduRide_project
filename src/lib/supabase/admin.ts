import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with service role key.
 * Handles URL cleanup (strips /rest/v1/ if present).
 * Use this in ALL API routes.
 */
export function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  // Strip any trailing paths like /rest/v1/ or /rest/v1/anything
  url = url.replace(/\/rest\/v1\/?.*$/, '').replace(/\/$/, '');

  if (!url || !url.startsWith('https://')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured correctly');
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
