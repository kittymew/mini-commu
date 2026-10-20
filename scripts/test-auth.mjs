import { spawnSync } from 'node:child_process'
import { localConfig } from './local-db.mjs'
const env = localConfig()
const result = spawnSync('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.auth.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: env.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: env.PUBLISHABLE_KEY, VITE_SITE_URL: 'http://127.0.0.1:5173/mini-commu/' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
