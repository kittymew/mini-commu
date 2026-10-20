import assert from 'node:assert/strict'
import { before,after,test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { ImageMagick,MagickColors,MagickFormat } from '@imagemagick/magick-wasm'
import { localConfig,connect,asUser } from '../../scripts/local-db.mjs'
import { initializeImages,processProfile } from '../functions/profile-image/image.mjs'
import { createProfileHandler } from '../functions/profile-image/handler.mjs'

const env=localConfig(), root=await connect(env)
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[], tokens={}, clients={}
const password=`Test-${randomUUID()}!`
const fixturePosts=[], fixtureComments=[], uploaded=[]
let handler
before(async()=>{
  for(const name of ['member','other','operator','limited','retries','suspended','uninvited']){
    const email=`stage4-${randomUUID()}@example.test`
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null)
    users.push(created.data.user.id)
    const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null)
    clients[name]={client,id:created.data.user.id};tokens[name]=login.data.session.access_token
    if(name!=='uninvited')await root.query('insert into private.members(user_id,status) values($1,$2)',[created.data.user.id,name==='suspended'?'suspended':'active'])
  }
  await root.query("update private.members set role='admin' where user_id=$1",[clients.operator.id])
  await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))))
  handler=createProfileHandler({url:env.API_URL,publicKey:env.ANON_KEY,serviceKey:env.SERVICE_ROLE_KEY,origins:['http://127.0.0.1:5173']})
})
after(async()=>{
  const assets=(await root.query('select a.id,a.storage_path,a.thumbnail_path from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
  const paths=[...new Set([...uploaded,...assets.flatMap(a=>[a.storage_path,a.thumbnail_path]).filter(Boolean)])]
  if(paths.length)await admin.storage.from('community').remove(paths)
  try{
    await root.query('begin')
    await root.query('delete from private.content_owners where user_id=any($1::uuid[])',[users])
    await root.query('delete from public.comments where id=any($1::uuid[])',[fixtureComments])
    await root.query('delete from public.posts where id=any($1::uuid[])',[fixturePosts])
    const characters=(await root.query('delete from private.character_owners where user_id=any($1::uuid[]) returning character_id',[users])).rows.map(r=>r.character_id)
    await root.query('delete from public.characters where id=any($1::uuid[])',[characters])
    await root.query('delete from private.asset_owners where user_id=any($1::uuid[])',[users])
    await root.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await root.query('alter table private.members disable trigger protect_last_admin')
    await root.query('delete from private.members where user_id=any($1::uuid[])',[users])
    await root.query('alter table private.members enable trigger protect_last_admin')
    await root.query('commit')
  }catch(e){await root.query('rollback');throw e}finally{await root.end()}
  for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null)
})
const rpc=(who,name,args={})=>clients[who].client.rpc(name,args)
async function create(who,name='캐릭터',avatar=null,id=randomUUID()){
  const result=await rpc(who,'create_character',{character_name:name,avatar_id:avatar,request_id:id})
  assert.equal(result.error,null);return result.data
}
const current=async(id)=>(await root.query('select * from public.characters where id=$1',[id])).rows[0]
async function change(who,id,status){const c=await current(id);return rpc(who,'set_character_status',{target_id:id,expected_version:c.version,new_status:status})}
async function upload(who,bytes,mime='image/png'){
  const response=await handler(new Request('http://127.0.0.1/profile-image',{method:'POST',headers:{Authorization:`Bearer ${tokens[who]}`,'Content-Type':mime},body:bytes}))
  return {status:response.status,body:await response.json()}
}
const png=()=>ImageMagick.read(MagickColors.Red,32,16,img=>img.write(MagickFormat.Png,b=>Uint8Array.from(b)))

test('character validation counts Unicode code points, normalizes line breaks and allows duplicate names',async()=>{
  const first=await create('member','😀'.repeat(30)), second=await create('member','😀'.repeat(30));assert.notEqual(first,second)
  assert.equal((await rpc('member','create_character',{character_name:'😀'.repeat(31)})).error.message,'INVALID_INPUT')
  assert.equal((await rpc('member','create_character',{character_name:' '})).error.message,'INVALID_INPUT')
  assert.equal((await rpc('member','update_character',{target_id:first,expected_version:1,character_name:'이름',character_bio:'가\r\n나\r다',avatar_id:null})).error,null)
  assert.equal((await current(first)).bio,'가\n나\n다')
  assert.equal((await rpc('member','update_character',{target_id:first,expected_version:2,character_name:'이름',character_bio:'가'.repeat(301),avatar_id:null})).error.message,'INVALID_INPUT')
})

test('six active characters is atomic across simultaneous creation and reactivation; deletion never reuses IDs',async()=>{
  const results=await Promise.all(Array.from({length:8},(_,i)=>rpc('limited','create_character',{character_name:`동시${i}`})))
  const ids=results.filter(r=>!r.error).map(r=>r.data)
  assert.equal(ids.length,6);assert.equal(results.filter(r=>r.error?.message==='CHARACTER_LIMIT').length,2)
  assert.equal((await change('limited',ids[0],'disabled')).error,null)
  const newId=await create('limited','새 캐릭터');assert.ok(!ids.includes(newId))
  assert.equal((await change('limited',ids[0],'active')).error.message,'CHARACTER_LIMIT')
  assert.equal((await change('limited',newId,'deleted')).error,null)
  assert.equal((await change('limited',newId,'active')).error.message,'CHARACTER_DELETED')
  assert.equal((await change('limited',ids[0],'active')).error,null)
  assert.equal((await current(newId)).status,'deleted')
  await change('limited',ids[1],'disabled');await change('limited',ids[2],'disabled')
  const raced=await Promise.all([change('limited',ids[1],'active'),change('limited',ids[2],'active'),rpc('limited','create_character',{character_name:'경합1'}),rpc('limited','create_character',{character_name:'경합2'})])
  assert.equal(raced.filter(r=>!r.error).length,2)
  assert.equal(raced.filter(r=>r.error?.message==='CHARACTER_LIMIT').length,2)
})

test('idempotent creation and version checks prevent duplicate characters and lost edits',async()=>{
  const id=randomUUID()
  const results=await Promise.all([create('retries','중복',null,id),create('retries','중복',null,id)])
  assert.deepEqual(results,[id,id])
  const args={target_id:id,expected_version:1,character_name:'변경',character_bio:'소개',avatar_id:null}
  const edits=await Promise.all([rpc('retries','update_character',args),rpc('retries','update_character',args)])
  assert.equal(edits.filter(r=>!r.error).length,1);assert.equal(edits.filter(r=>r.error?.message==='CHARACTER_CONFLICT').length,1)
})

test('ownership and active membership apply to every character RPC, even for administrators',async()=>{
  const id=await create('other','다른 사람')
  for(const actor of ['member','operator']){
    assert.equal((await rpc(actor,'update_character',{target_id:id,expected_version:1,character_name:'위조',character_bio:'',avatar_id:null})).error.message,'CHARACTER_NOT_OWNED')
    assert.equal((await change(actor,id,'deleted')).error.message,'CHARACTER_NOT_OWNED')
    assert.ok(!(await rpc(actor,'list_my_characters')).data.some(c=>c.id===id))
  }
  for(const actor of ['suspended','uninvited']){
    assert.equal((await rpc(actor,'create_character',{character_name:'우회'})).error.message,'ACTIVE_MEMBER_REQUIRED')
    assert.equal((await rpc(actor,'list_my_characters')).error.message,'ACTIVE_MEMBER_REQUIRED')
  }
  const listed=await rpc('other','list_my_characters')
  assert.ok(listed.data.every(row=>!('user_id' in row)&&!('email' in row)))
  await assert.rejects(asUser(env,clients.other.id,"update public.characters set name='우회' where id=$1",[id]),{code:'42501'})
  await assert.rejects(asUser(env,null,"select public.create_character('비회원')"),{code:'42501'})
})

test('profile upload validates real bytes, stores private WebP versions and only the owner can attach them',async()=>{
  const result=await upload('member',png());assert.equal(result.status,200)
  const asset=result.body.assetId
  const row=(await root.query('select * from public.assets where id=$1',[asset])).rows[0]
  assert.equal(row.status,'ready');assert.match(row.storage_path,/^profiles\/[0-9a-f-]+\/main.webp$/)
  const stored=await clients.member.client.storage.from('community').download(row.storage_path);assert.equal(stored.error,null)
  ImageMagick.read(new Uint8Array(await stored.data.arrayBuffer()),image=>{assert.equal(image.format,MagickFormat.WebP);assert.equal(image.width,32);assert.equal(image.height,16);assert.equal(image.profileNames.length,0)})
  assert.equal((await rpc('other','create_character',{character_name:'위조 이미지',avatar_id:asset})).error.message,'INVALID_AVATAR')
  assert.equal((await rpc('member','finalize_profile_asset',{target_id:asset,owner_id:clients.member.id,stored_bytes:1,accepted:true})).error.code,'42501')
  const pending=await rpc('member','reserve_profile_asset');assert.equal(pending.error,null)
  assert.equal((await rpc('member','create_character',{character_name:'미검증',avatar_id:pending.data})).error.message,'INVALID_AVATAR')
  assert.equal((await rpc('other','get_asset_paths',{asset_ids:[asset]})).data.length,0)
  const again=await upload('member',png());assert.equal(again.status,200);assert.notEqual(again.body.assetId,asset)
})

test('server snapshot capture overrides spoofed fields, preserves history and private ownership after character changes',async()=>{
  const a=(await upload('member',png())).body.assetId,b=(await upload('member',png())).body.assetId
  const character=await create('member','과거 이름',a), post=randomUUID(),comment=randomUUID()
  fixturePosts.push(post);fixtureComments.push(comment)
  await root.query('begin')
  try{
    await root.query("select set_config('request.jwt.claim.sub',$1,true)",[clients.member.id])
    await root.query("insert into public.posts(id,category_id,type,title,body_text,author_character_id,author_name_snapshot,author_avatar_asset_id) values($1,'00000000-0000-0000-0000-000000000001','general','스냅샷','본문',$2,'위조',null)",[post,character])
    await root.query("insert into public.comments(id,post_id,body,author_character_id,author_name_snapshot) values($1,$2,'댓글',$3,'위조')",[comment,post,character])
    await root.query('commit')
  }catch(e){await root.query('rollback');throw e}
  assert.equal((await rpc('member','update_character',{target_id:character,expected_version:1,character_name:'새 이름',character_bio:'',avatar_id:b})).error,null)
  assert.equal((await change('member',character,'deleted')).error,null)
  for(const [table,id] of [['posts',post],['comments',comment]]){
    const row=(await root.query(`select * from public.${table} where id=$1`,[id])).rows[0]
    assert.equal(row.author_name_snapshot,'과거 이름');assert.equal(row.author_avatar_asset_id,a);assert.equal(row.author_character_id,character)
    await assert.rejects(root.query(`update public.${table} set author_name_snapshot='변경' where id=$1`,[id]),{code:'23514'})
  }
  assert.equal((await root.query('select user_id from private.content_owners where content_id=$1',[post])).rows[0].user_id,clients.member.id)
  await assert.rejects(root.query('update private.content_owners set user_id=$1 where content_id=$2',[clients.other.id,post]),/OWNERSHIP_IMMUTABLE/)
  await assert.rejects(root.query('update private.character_owners set user_id=$1 where character_id=$2',[clients.other.id,character]),/OWNERSHIP_IMMUTABLE/)
  await assert.rejects(root.query('update public.characters set id=$1 where id=$2',[randomUUID(),character]),/CHARACTER_IDENTITY_IMMUTABLE/)
  const paths=await rpc('other','get_asset_paths',{asset_ids:[a]});assert.equal(paths.data.length,1)
  assert.equal((await clients.other.client.storage.from('community').download(paths.data[0].storage_path)).error,null)
  await assert.rejects(root.query('delete from public.assets where id=$1',[a]),{code:'23503'})
})

test('snapshot capture rejects another account or inactive character through trusted write context',async()=>{
  const id=await create('other','소유 검증')
  async function attempt(actor){
    await root.query('begin')
    try{await root.query("select set_config('request.jwt.claim.sub',$1,true)",[clients[actor].id]);await root.query("insert into public.posts(category_id,type,title,body_text,author_character_id,author_name_snapshot) values('00000000-0000-0000-0000-000000000001','general','본문','본문',$1,'위조')",[id])}
    finally{await root.query('rollback')}
  }
  await assert.rejects(attempt('member'),/CHARACTER_NOT_OWNED/)
  await change('other',id,'disabled')
  await assert.rejects(attempt('other'),/CHARACTER_NOT_OWNED/)
})

test('profile server rejects unauthorized users, MIME spoofing, SVG, animation and oversized bodies',async()=>{
  for(const actor of ['suspended','uninvited'])assert.equal((await upload(actor,png())).status,403)
  assert.equal((await handler(new Request('http://127.0.0.1/profile-image',{method:'POST',body:png()}))).status,401)
  assert.equal((await upload('other',png(),'image/jpeg')).status,400)
  assert.equal((await upload('other',new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),'image/png')).status,400)
  const base=png(), apng=new Uint8Array(base.length+20);apng.set(base.subarray(0,33));new DataView(apng.buffer).setUint32(33,8);apng.set(new TextEncoder().encode('acTL'),37);apng.set(base.subarray(33),53)
  assert.equal((await upload('other',apng)).body.error,'ANIMATED_IMAGE')
  assert.equal((await upload('other',new Uint8Array(10485761))).status,413)
  assert.equal((await root.query("select count(*) from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=$1 and a.status='rejected'",[clients.other.id])).rows[0].count,'4')
})

test('image processing rotates EXIF, strips metadata and produces bounded main/thumbnail images',()=>{
  const exif=Uint8Array.from([69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0])
  const base=ImageMagick.read(MagickColors.Blue,2400,1200,image=>image.write(MagickFormat.Jpeg,b=>Uint8Array.from(b)))
  const jpeg=new Uint8Array(base.length+exif.length+4)
  jpeg.set([255,216,255,225,0,exif.length+2]);jpeg.set(exif,6);jpeg.set(base.subarray(2),6+exif.length)
  const result=processProfile(jpeg,'image/jpeg')
  ImageMagick.read(result.main,image=>{assert.equal(image.width,1024);assert.equal(image.height,2048);assert.equal(image.profileNames.length,0)})
  ImageMagick.read(result.thumbnail,image=>{assert.equal(image.width,128);assert.equal(image.height,256)})
})

test('upload reservations enforce a persistent account quota and cannot be finalized by members',async()=>{
  for(let i=0;i<20;i++)assert.equal((await rpc('operator','reserve_profile_asset')).error,null)
  assert.equal((await rpc('operator','reserve_profile_asset')).error.message,'UPLOAD_RATE_LIMIT')
  assert.equal((await upload('operator',png())).status,429)
})
