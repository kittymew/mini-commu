import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { localConfig } from './local-db.mjs'
import { initializeImages } from '../supabase/functions/profile-image/image.mjs'
import { createProfileHandler } from '../supabase/functions/profile-image/handler.mjs'

export async function startProfileServer(env = localConfig()) {
  await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))))
  const handler=createProfileHandler({url:env.API_URL,publicKey:env.ANON_KEY,serviceKey:env.SERVICE_ROLE_KEY,origins:['http://127.0.0.1:5173','http://localhost:5173']})
  const postHandler=createProfileHandler({url:env.API_URL,publicKey:env.ANON_KEY,serviceKey:env.SERVICE_ROLE_KEY,origins:['http://127.0.0.1:5173','http://localhost:5173'],kind:'post'})
  const server=createServer(async (incoming,outgoing)=>{
    try {
      const request=new Request(`http://127.0.0.1:54325${incoming.url}`,{method:incoming.method,headers:incoming.headers,body:['GET','HEAD'].includes(incoming.method)?undefined:Readable.toWeb(incoming),duplex:'half'})
      const response=await (incoming.url==='/post-image'?postHandler:handler)(request)
      outgoing.writeHead(response.status,Object.fromEntries(response.headers))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch { outgoing.writeHead(503); outgoing.end() }
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(54325,'127.0.0.1',resolve)})
  return server
}
