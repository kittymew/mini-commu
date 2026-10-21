import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {ImageMagick,MagickColors,MagickFormat} from '@imagemagick/magick-wasm'
import {initializeImages} from '../../supabase/functions/profile-image/image.mjs'
import {localConfig,connect} from '../../scripts/local-db.mjs'
const env=localConfig(),users=[],actors={},functions=['profile-image','post-image']
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
let png
async function call(name,token,body=png,headers={}) {
  return fetch(`${env.API_URL}/functions/v1/${name}`,{method:'POST',headers:{'content-type':'image/png',...(token?{authorization:`Bearer ${token}`} : {}),...headers},body,signal:AbortSignal.timeout(30000)})
}
before(async()=>{
  let ready=false
  for(let n=0;n<30;n++) {try{const r=await call('profile-image',null,new Uint8Array());if(r.status===401){ready=true;break}}catch{/* Startup may still be in progress. */}await new Promise(resolve=>setTimeout(resolve,2000))}
  assert.ok(ready,'Start local functions serve before test:edge')
  await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))))
  png=ImageMagick.read(MagickColors.Orange,120,80,img=>img.write(MagickFormat.Png,data=>Uint8Array.from(data)))
  const db=await connect(env)
  try{for(const name of ['active','suspended','uninvited']) {
    const email=`edge-${randomUUID()}@example.test`,password=`Edge-${randomUUID()}!`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);users.push(r.data.user.id)
    if(name!=='uninvited')await db.query('insert into private.members(user_id,status) values($1,$2)',[r.data.user.id,name])
    const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);actors[name]={id:r.data.user.id,token:login.data.session.access_token}
  }}finally{await db.end()}
})
after(async()=>{
  const db=await connect(env)
  try{
    const rows=(await db.query('select a.* from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
    const paths=rows.flatMap(a=>[a.storage_path,a.thumbnail_path,`temporary/${a.id}/source`]).filter(Boolean)
    if(paths.length)assert.equal((await admin.storage.from('community').remove(paths)).error,null)
    await db.query('delete from public.assets where id=any($1::uuid[])',[rows.map(a=>a.id)])
    await db.query('delete from private.members where user_id=any($1::uuid[])',[users])
  }finally{await db.end()}
  for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null)
})
test('Deno entrypoints load WASM and deny missing/invalid tokens and foreign origins',async()=>{
  for(const name of functions){assert.equal((await call(name)).status,401);assert.equal((await call(name,'invalid-token')).status,401);const foreign=await call(name,actors.active.token,png,{origin:'https://untrusted.example'});assert.equal(foreign.status,403);assert.equal((await foreign.json()).error,'ORIGIN_DENIED')}
})
test('Deno entrypoints reject real uninvited and suspended Auth JWTs',async()=>{
  for(const name of functions)for(const actor of ['uninvited','suspended'])assert.equal((await call(name,actors[actor].token)).status,403)
})
test('both Deno functions transform actual bytes and finalize private WebP Storage objects',async()=>{
  const db=await connect(env)
  try{for(const name of functions){
    const r=await call(name,actors.active.token);assert.equal(r.status,200);const {assetId}=await r.json()
    const row=(await db.query('select * from public.assets where id=$1',[assetId])).rows[0];assert.equal(row.status,'ready');assert.ok(row.storage_path.startsWith(name==='post-image'?'attachments/':'profiles/'))
    for(const path of [row.storage_path,row.thumbnail_path]){const file=await admin.storage.from('community').download(path);assert.equal(file.error,null);const bytes=Buffer.from(await file.data.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP')}
    assert.ok((await admin.storage.from('community').download(`temporary/${assetId}/source`)).error)
  }}finally{await db.end()}
})
test('Deno rejects MIME-spoofed content without finalizing a ready asset',async()=>{
  const db=await connect(env)
  try{const before=(await db.query("select count(*) from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=$1 and a.status='ready'",[actors.active.id])).rows[0].count
    for(const name of functions){const r=await call(name,actors.active.token,new TextEncoder().encode('<svg onload="alert(1)"/>'));assert.equal(r.status,400);assert.equal((await r.json()).error,'INVALID_IMAGE')}
    assert.equal((await db.query("select count(*) from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=$1 and a.status='ready'",[actors.active.id])).rows[0].count,before)
  }finally{await db.end()}
})
