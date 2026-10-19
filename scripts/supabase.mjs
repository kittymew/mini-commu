import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const result = spawnSync(resolve('node_modules/.bin/supabase'), process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_HOME: process.env.SUPABASE_HOME ?? resolve('.supabase-local') },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
