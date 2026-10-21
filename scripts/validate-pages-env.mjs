import {pathToFileURL} from 'node:url'

export const pagesUrl = 'https://kittymew.github.io/mini-commu/'
export function validatePagesEnv(env) {
  const errors = []
  let backend
  try { backend = new URL(env.VITE_SUPABASE_URL ?? '') } catch { /* Report only the field name, never its value. */ }
  if (!backend || backend.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(backend.hostname) || backend.port || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) errors.push('VITE_SUPABASE_URL: hosted Supabase project HTTPS URL required')
  if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY: publishable key required')
  if (env.VITE_SITE_URL !== pagesUrl) errors.push('VITE_SITE_URL: expected repository Pages URL with trailing slash')
  const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SITE_URL'])
  if (Object.keys(env).some(key => key.startsWith('VITE_') && !allowed.has(key) && env[key])) errors.push('Unexpected VITE_ variable: production builds allow only the three documented public settings')
  return errors
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {loadEnv} = await import('vite')
  const errors = validatePagesEnv({...loadEnv('production',process.cwd(),'VITE_'),...process.env})
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('Pages public configuration is valid (values omitted)')
}
