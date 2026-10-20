import { spawn } from 'node:child_process'
import { localConfig } from './local-db.mjs'
import { startProfileServer } from './profile-server.mjs'
export async function runWithProfile(args) {
  const env=localConfig()
  const server=await startProfileServer(env)
  const child=spawn('pnpm',args,{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_PUBLISHABLE_KEY:env.PUBLISHABLE_KEY,VITE_SITE_URL:'http://127.0.0.1:5173/mini-commu/',VITE_PROFILE_UPLOAD_URL:'http://127.0.0.1:54325/profile-image'}})
  const stop=()=>child.kill('SIGTERM')
  process.once('SIGINT',stop);process.once('SIGTERM',stop)
  try { return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1))}) }
  finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve));process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop) }
}
