import { createClient } from '@supabase/supabase-js'
import { publicEnv } from './env'
import type { Database } from '../types/database'

// No client or network request when configuration is absent. Auth is implemented in step 3.
export const supabase = publicEnv.ready
  ? createClient<Database>(publicEnv.values.supabaseUrl, publicEnv.values.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    })
  : null
