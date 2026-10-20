import { initializeImages } from '../profile-image/image.mjs'
import { createProfileHandler } from '../profile-image/handler.mjs'

const wasm = await Deno.readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')))
await initializeImages(wasm)
Deno.serve(createProfileHandler({
  kind: 'post',
  url: Deno.env.get('SUPABASE_URL')!,
  publicKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  origins: (Deno.env.get('APP_ORIGINS') ?? '').split(',').filter(Boolean),
}))
