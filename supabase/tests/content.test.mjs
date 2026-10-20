import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {ImageMagick,MagickColors,MagickFormat} from '@imagemagick/magick-wasm'
import {initializeImages} from '../functions/profile-image/image.mjs'
import {createProfileHandler} from '../functions/profile-image/handler.mjs'
import {localConfig,connect,asUser} from '../../scripts/local-db.mjs'
const env=localConfig(),db=await connect(env)
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[],actors={},categories=[]
const baseCategory='00000000-0000-0000-0000-000000000001'
const doc=(text='본문')=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
let handler
const rpc=(who,name,args={})=>actors[who].client.rpc(name,args)
async function ok(who,name,args){const r=await rpc(who,name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data}
async function post(who='member',args={}){return ok(who,'create_post',{request_id:randomUUID(),character_id:actors[who].char,category_id:baseCategory,post_title:'제목',document:doc(),...args})}
async function comment(postId,who='member',args={}){return ok(who,'create_comment',{request_id:randomUUID(),target_post:postId,character_id:actors[who].char,comment_body:'댓글',...args})}
async function image(who='member'){
  const png=ImageMagick.read(MagickColors.Blue,30,20,img=>img.write(MagickFormat.Png,b=>Uint8Array.from(b)))
  const response=await handler(new Request('http://127.0.0.1/post-image',{method:'POST',headers:{Authorization:`Bearer ${actors[who].token}`,'Content-Type':'image/png'},body:png}))
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.assetId
}
before(async()=>{
  for(const name of ['member','other','operator','suspended','uninvited']){
    const email=`stage5-${randomUUID()}@example.test`,password=`Test-${randomUUID()}!`
    const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);const id=r.data.user.id;users.push(id)
    const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null)
    actors[name]={id,client,token:login.data.session.access_token}
    if(name!=='uninvited'){
      await db.query('insert into private.members(user_id) values($1)',[id])
      actors[name].char=await ok(name,'create_character',{character_name:`${name} 모습`})
    }
  }
  await db.query("update private.members set role='admin' where user_id=$1",[actors.operator.id])
  await db.query("update private.members set status='suspended' where user_id=$1",[actors.suspended.id])
  await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))))
  handler=createProfileHandler({url:env.API_URL,publicKey:env.ANON_KEY,serviceKey:env.SERVICE_ROLE_KEY,origins:[],kind:'post'})
})
after(async()=>{
  const assets=(await db.query('select a.* from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
  const paths=assets.flatMap(a=>[a.storage_path,a.thumbnail_path,`temporary/${a.id}/source`]).filter(Boolean)
  if(paths.length)assert.equal((await admin.storage.from('community').remove(paths)).error,null)
  try{
    await db.query('begin')
    const posts=(await db.query("select content_id from private.content_owners where user_id=any($1::uuid[]) and content_kind='post'",[users])).rows.map(r=>r.content_id)
    const chars=(await db.query('select character_id from private.character_owners where user_id=any($1::uuid[])',[users])).rows.map(r=>r.character_id)
    await db.query('delete from private.content_owners where user_id=any($1::uuid[])',[users])
    await db.query('delete from public.comments where post_id=any($1::uuid[])',[posts])
    await db.query('delete from public.post_images where post_id=any($1::uuid[])',[posts])
    await db.query('delete from public.posts where id=any($1::uuid[])',[posts])
    await db.query('delete from public.categories where id=any($1::uuid[])',[categories])
    await db.query('delete from private.character_owners where user_id=any($1::uuid[])',[users])
    await db.query('delete from public.characters where id=any($1::uuid[])',[chars])
    await db.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await db.query('alter table private.members disable trigger protect_last_admin')
    await db.query('delete from private.members where user_id=any($1::uuid[])',[users])
    await db.query('alter table private.members enable trigger protect_last_admin')
    await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null)
})

test('structured document validates every node, derives text and rejects embedded HTML/images/unsafe URLs',async()=>{
  const rich={type:'doc',content:[{type:'bullet',content:[{type:'text',text:'굵게😀',marks:[{type:'bold'},{type:'italic'},{type:'link',href:'https://example.com'}]}]},{type:'ordered',content:[{type:'text',text:'다음\n줄'}]}]}
  const id=await post('member',{document:rich});const p=await ok('other','get_post',{target_id:id});assert.equal(p.body_text,'굵게😀\n다음\n줄');assert.deepEqual(p.body_json,rich)
  for(const document of [null,{type:'doc',html:'<script/>',content:[]},doc('가'.repeat(5001)),{type:'doc',content:[{type:'image',src:'data:image/png;base64,AA'}]}, {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'bad',marks:[{type:'link',href:'javascript:alert(1)'}]}]}]}]){
    assert.ok((await rpc('member','create_post',{request_id:randomUUID(),character_id:actors.member.char,category_id:baseCategory,post_title:'x',document})).error)
  }
  assert.ok((await rpc('member','create_post',{request_id:randomUUID(),character_id:actors.member.char,category_id:baseCategory,post_title:'😀'.repeat(101),document:doc()})).error)
})
test('post creation retries are idempotent and immutable snapshots survive character changes',async()=>{
  const id=randomUUID();const results=await Promise.all([post('member',{request_id:id}),post('member',{request_id:id})]);assert.deepEqual(results,[id,id])
  const p=await ok('member','get_post',{target_id:id});assert.equal(p.can_edit,true);assert.equal(p.author_name_snapshot,'member 모습')
  const c=(await ok('member','list_my_characters')).find(c=>c.id===actors.member.char)
  await ok('member','update_character',{target_id:c.id,expected_version:c.version,character_name:'이름 변경',character_bio:''})
  const second=await ok('member','create_character',{character_name:'새 모습'})
  await ok('member','update_post',{target_id:id,expected_version:1,category_id:baseCategory,post_title:'수정',document:doc('수정본문')})
  assert.equal((await ok('member','get_post',{target_id:id})).author_character_id,c.id)
  assert.equal((await ok('member','get_post',{target_id:id})).author_name_snapshot,'member 모습')
  await ok('member','set_character_status',{target_id:c.id,expected_version:c.version+1,new_status:'deleted'})
  actors.member.char=second
  assert.equal((await ok('other','get_post',{target_id:id})).author_name_snapshot,'member 모습')
  await assert.rejects(db.query("update public.posts set type='poll' where id=$1",[id]),/POST_IDENTITY_IMMUTABLE/)
})
test('post versions serialize edits and even admins cannot edit other authors',async()=>{
  const id=await post(),args={target_id:id,expected_version:1,category_id:baseCategory,post_title:'수정',document:doc()}
  const results=await Promise.all([rpc('member','update_post',args),rpc('member','update_post',args)])
  assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.find(r=>r.error).error.message,'CONTENT_CONFLICT')
  for(const who of ['other','operator']){
    assert.equal((await rpc(who,'update_post',{...args,expected_version:2})).error.message,'CONTENT_NOT_OWNED')
    assert.equal((await rpc(who,'delete_post',{target_id:id,expected_version:2})).error.message,'CONTENT_NOT_OWNED')
    assert.equal((await ok(who,'get_post',{target_id:id})).can_edit,false)
  }
  assert.ok((await asUser(env,actors.member.id,'select id from public.posts where id=$1',[id])).rows.length)
  await assert.rejects(asUser(env,actors.member.id,"update public.posts set title='bypass' where id=$1",[id]),{code:'42501'})
})
test('four processed attachments are atomic, ordered and cannot be borrowed or supplied twice',async()=>{
  const ids=[];for(let i=0;i<5;i++)ids.push(await image())
  const id=await post('member',{image_ids:ids.slice(0,4)})
  assert.deepEqual((await ok('other','get_post',{target_id:id})).image_ids,ids.slice(0,4))
  const args={target_id:id,expected_version:1,category_id:baseCategory,post_title:'이미지',document:doc()}
  assert.equal((await rpc('member','update_post',{...args,image_ids:ids})).error.message,'IMAGE_LIMIT')
  assert.equal((await rpc('member','update_post',{...args,image_ids:[ids[0],ids[0]]})).error.message,'IMAGE_LIMIT')
  const foreign=await image('other')
  assert.equal((await rpc('member','update_post',{...args,image_ids:[foreign]})).error.message,'INVALID_ASSET')
  await ok('member','update_post',{...args,image_ids:[ids[3],ids[0]]})
  assert.deepEqual((await ok('other','get_post',{target_id:id})).image_ids,[ids[3],ids[0]])
  assert.equal((await actors.other.client.storage.from('community').download(`temporary/${ids[0]}/source`)).data,null)
  assert.equal((await db.query("select count(*)::int n from storage.objects where name like 'temporary/%' and name like any($1::text[])",[ids.map(id=>`%${id}%`)])).rows[0].n,0)
})
test('comments enforce one-level same-post replies, account ownership and deleted-parent redaction',async()=>{
  const p=await post(),otherPost=await post('other');const parent=await comment(p),reply=await comment(p,'other',{parent_comment:parent})
  assert.equal((await rpc('other','create_comment',{request_id:randomUUID(),target_post:p,character_id:actors.other.char,comment_body:'깊이',parent_comment:reply})).error.message,'INVALID_PARENT')
  assert.equal((await rpc('other','create_comment',{request_id:randomUUID(),target_post:otherPost,character_id:actors.other.char,comment_body:'다른글',parent_comment:parent})).error.message,'INVALID_PARENT')
  assert.equal((await rpc('operator','change_comment',{target_id:parent,expected_version:1,comment_body:'위조'})).error.message,'CONTENT_NOT_OWNED')
  await ok('member','change_comment',{target_id:parent,expected_version:1,remove:true})
  const rows=await ok('other','list_comments',{target_post:p});const deleted=rows.find(c=>c.id===parent)
  for(const key of ['body','author_character_id','author_name_snapshot','author_avatar_asset_id'])assert.equal(deleted[key],null)
  assert.equal(deleted.deleted,true);assert.equal(rows.find(c=>c.id===reply).body,'댓글')
  assert.equal((await actors.other.client.from('comments').select('*').eq('id',parent)).data.length,0)
  await ok('other','change_comment',{target_id:reply,expected_version:1,remove:true})
  assert.equal((await ok('other','list_comments',{target_post:p})).length,0)
})
test('comment retries, length normalization, conflicts and spoofed characters are checked server-side',async()=>{
  const p=await post(),id=randomUUID()
  assert.deepEqual(await Promise.all([comment(p,'member',{request_id:id,comment_body:'가\r\n나'}),comment(p,'member',{request_id:id,comment_body:'가\r\n나'})]),[id,id])
  assert.equal((await ok('other','list_comments',{target_post:p}))[0].body,'가\n나')
  const args={target_id:id,expected_version:1,comment_body:'수정'}
  const edits=await Promise.all([rpc('member','change_comment',args),rpc('member','change_comment',args)]);assert.equal(edits.filter(r=>!r.error).length,1)
  assert.ok((await rpc('member','change_comment',{...args,expected_version:2,comment_body:'😀'.repeat(1001)})).error)
  assert.equal((await rpc('member','create_comment',{request_id:randomUUID(),target_post:p,character_id:actors.other.char,comment_body:'위조'})).error.message,'CHARACTER_NOT_OWNED')
})
test('deleted or hidden posts deny direct detail, comments, new writes and attachment reads',async()=>{
  for(const status of ['author_deleted','moderator_hidden']){
    const asset=await image(),p=await post('member',{image_ids:[asset]});await comment(p)
    if(status==='author_deleted')await ok('member','delete_post',{target_id:p,expected_version:1})
    else await db.query('update public.posts set status=$1 where id=$2',[status,p])
    assert.equal(await ok('other','get_post',{target_id:p}),null)
    assert.ok((await rpc('other','list_comments',{target_post:p})).error)
    assert.ok((await rpc('other','create_comment',{request_id:randomUUID(),target_post:p,character_id:actors.other.char,comment_body:'차단'})).error)
    assert.equal((await actors.other.client.from('posts').select('*').eq('id',p)).data.length,0)
    assert.equal((await ok('other','get_asset_paths',{asset_ids:[asset]})).length,0)
    assert.equal((await actors.other.client.storage.from('community').download(`attachments/${asset}/main.webp`)).data,null)
  }
})
test('category administration, atomic moves, conflict detection and last category protection',async()=>{
  assert.equal((await rpc('member','save_category',{category_name:'금지',position_value:0})).error.message,'ADMIN_REQUIRED')
  const from=await ok('operator','save_category',{category_name:'첫 분류',position_value:2}),to=await ok('operator','save_category',{category_name:'둘째 분류',position_value:1});categories.push(from,to)
  const p=await post('member',{category_id:from})
  assert.equal((await rpc('operator','delete_category',{target_id:from,expected_version:1})).error.message,'CATEGORY_DESTINATION_REQUIRED')
  await ok('operator','move_post_category',{target_id:p,expected_version:1,category_id:to})
  await ok('member','update_post',{target_id:p,expected_version:2,category_id:from,post_title:'이동',document:doc()})
  await ok('operator','delete_category',{target_id:from,expected_version:1,move_to:to})
  assert.equal((await ok('member','get_post',{target_id:p})).category_id,to)
  assert.equal((await ok('member','get_post',{target_id:p})).version,4)
  await ok('operator','delete_category',{target_id:to,expected_version:1,move_to:baseCategory})
  assert.equal((await rpc('operator','delete_category',{target_id:baseCategory,expected_version:1})).error.message,'LAST_CATEGORY')
})
test('keyset pagination covers more than one feed/comment page without duplicates',async()=>{
  const category=await ok('operator','save_category',{category_name:'페이지 테스트',position_value:8});categories.push(category)
  const ids=[];for(let i=0;i<23;i++)ids.push(await post('member',{category_id:category,post_title:`페이지${i}`}))
  const first=await ok('other','list_posts',{category_filter:category});assert.equal(first.length,20)
  await post('member',{category_id:category,post_title:'뒤늦은 새글'})
  const last=first.at(-1),next=await ok('other','list_posts',{category_filter:category,before_time:last.created_at,before_id:last.id})
  assert.deepEqual(new Set([...first,...next].map(p=>p.id)),new Set(ids))
  const p=ids[0];for(let i=0;i<52;i++)await comment(p)
  const a=await ok('other','list_comments',{target_post:p}),end=a.at(-1),b=await ok('other','list_comments',{target_post:p,after_time:end.created_at,after_id:end.id})
  assert.equal(a.length,50);assert.equal(b.length,2);assert.equal(new Set([...a,...b].map(c=>c.id)).size,52)
})
test('inactive and uninvited accounts cannot call content read/write APIs or cleanup',async()=>{
  const p=await post()
  for(const who of ['suspended','uninvited'])for(const [name,args] of [['list_posts',{}],['get_post',{target_id:p}],['list_comments',{target_post:p}],['create_post',{request_id:randomUUID(),character_id:actors.member.char,category_id:baseCategory,post_title:'x',document:doc()}],['reserve_post_asset',{}]])assert.ok((await rpc(who,name,args)).error,`${who}:${name}`)
  assert.ok((await rpc('member','claim_unused_assets',{apply_changes:true})).error)
  const detail=await ok('other','get_post',{target_id:p});assert.ok(!JSON.stringify(detail).includes(actors.member.id));assert.ok(!JSON.stringify(detail).includes('@example.test'))
})
test('cleanup keeps every live or historical reference and makes claiming atomic with future attachment',async()=>{
  const orphan=await image(),referenced=await image(),snapshot=await image(),pending=await ok('member','reserve_post_asset')
  const p=await post('member',{image_ids:[referenced]});await ok('member','delete_post',{target_id:p,expected_version:1})
  const c=(await ok('member','list_my_characters')).find(c=>c.id===actors.member.char)
  await ok('member','update_character',{target_id:c.id,expected_version:c.version,character_name:c.name,character_bio:'',avatar_id:snapshot})
  await db.query("update public.assets set created_at=now()-interval '25 hours' where id=any($1::uuid[])",[[orphan,referenced,snapshot,pending]])
  const preview=await admin.rpc('claim_unused_assets',{apply_changes:false});assert.equal(preview.error,null);assert.ok(preview.data.some(a=>a.id===orphan));assert.ok(!preview.data.some(a=>a.id===referenced||a.id===snapshot))
  assert.equal((await db.query('select status from public.assets where id=$1',[orphan])).rows[0].status,'ready')
  const claimed=await admin.rpc('claim_unused_assets',{apply_changes:true});assert.equal(claimed.error,null)
  assert.ok(claimed.data.some(a=>a.id===pending))
  assert.equal((await rpc('member','create_post',{request_id:randomUUID(),character_id:c.id,category_id:baseCategory,post_title:'경합',document:doc(),image_ids:[orphan]})).error.message,'INVALID_ASSET')
  assert.equal((await rpc('member','update_character',{target_id:c.id,expected_version:c.version+1,character_name:c.name,character_bio:'',avatar_id:orphan})).error.message,'INVALID_AVATAR')
  for(const a of claimed.data){assert.equal((await admin.storage.from('community').remove([a.storage_path,a.thumbnail_path,a.temporary_path].filter(Boolean))).error,null);assert.equal((await admin.rpc('finish_asset_cleanup',{target_id:a.id})).error,null)}
  assert.equal((await db.query('select id from public.assets where id=$1',[orphan])).rowCount,0)
})
