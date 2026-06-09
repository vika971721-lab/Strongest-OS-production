import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../config/env.js';
import type { Database } from '../types/database.js';

let client: SupabaseClient<Database> | undefined;

export const getSupabaseAdminClient = (env: AppEnv): SupabaseClient<Database> | undefined => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return undefined;
  client ??= createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
};
