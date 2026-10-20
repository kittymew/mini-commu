import { createClient } from '@supabase/supabase-js'
import { publicEnv } from './env'
import type { Database } from '../types/database'

// Keep the unconfigured preview usable without making network requests.
export const supabase = publicEnv.ready
  ? createClient<Database>(publicEnv.values.supabaseUrl, publicEnv.values.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    })
  : null
