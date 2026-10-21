import { initializeImages } from './image.mjs'
import { createProfileHandler } from './handler.mjs'

const wasm = await Deno.readFile(new URL('../_shared/magick.wasm', import.meta.url))
await initializeImages(wasm)
Deno.serve(createProfileHandler({
  url: Deno.env.get('SUPABASE_URL')!,
  publicKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  origins: (Deno.env.get('APP_ORIGINS') ?? '').split(',').filter(Boolean),
}))
