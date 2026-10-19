import { createClient } from '@supabase/supabase-js'
import { publicEnv } from './env'

// No client or network request when configuration is absent. Auth is implemented in step 3.
export const supabase = publicEnv.ready
  ? createClient(publicEnv.values.supabaseUrl, publicEnv.values.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    })
  : null
