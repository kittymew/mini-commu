import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {localConfig,connect,asUser} from '../../scripts/local-db.mjs'
const env=localConfig(),db=await connect(env),users=[],actors={},categoryIds=[],assetIds=[]
const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const category='00000000-0000-0000-0000-000000000001',document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'한국어 부분 일치 본문'}]}]}
const settings=(extra={})=>({question:'함께 갈 곳?',options:['서울','부산','제주'],multiple:false,anonymous:true,allow_revote:false,results_policy:'after_vote',closes_at:null,...extra})
const rpc=(who,name,args={})=>actors[who].client.rpc(name,args)
async function ok(who,name,args={}){const r=await rpc(who,name,args);assert.equal(r.error,null,JSON.stringify(r.error));return r.data}
async function poll(extra={},who='member'){return ok(who,'create_poll_post',{request_id:randomUUID(),character_id:actors[who].char,category_id:category,post_title:'투표 이야기',document,settings:settings(extra)})}
async function post(title='검색 이야기',who='member',cat=category){return ok(who,'create_post',{request_id:randomUUID(),character_id:actors[who].char,category_id:cat,post_title:title,document})}
const get=(id,who='member')=>ok(who,'get_poll',{target_id:id})
async function vote(id,who='member',choices,character){const p=await get(id,who);return rpc(who,'submit_vote',{target_id:id,character_id:character??actors[who].char,option_ids:choices??[p.options[0].id]})}
before(async()=>{
  for(const name of ['member','other','operator','secondadmin','suspended','uninvited']){
    const email=`stage7-${randomUUID()}@example.test`,password=`Test-${randomUUID()}!`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);const id=r.data.user.id;users.push(id)
    const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});assert.equal((await client.auth.signInWithPassword({email,password})).error,null);actors[name]={id,client,email}
    if(name!=='uninvited'){await db.query('insert into private.members(user_id) values($1)',[id]);actors[name].char=await ok(name,'create_character',{character_name:`${name} 모습`})}
  }
  await db.query("update private.members set role='admin' where user_id=any($1::uuid[])",[[actors.operator.id,actors.secondadmin.id]])
  await db.query("update private.members set status='suspended' where user_id=$1",[actors.suspended.id])
})
after(async()=>{
  try{await db.query('begin')
    const posts=(await db.query("select content_id from private.content_owners where user_id=any($1::uuid[]) and content_kind='post'",[users])).rows.map(r=>r.content_id),chars=(await db.query('select character_id from private.character_owners where user_id=any($1::uuid[])',[users])).rows.map(r=>r.character_id)
    await db.query('delete from private.poll_vote_choices where poll_id=any($1::uuid[])',[posts]);await db.query('delete from private.poll_votes where poll_id=any($1::uuid[])',[posts]);await db.query('alter table public.poll_options disable trigger poll_option_invariants');await db.query('delete from public.poll_options where poll_id=any($1::uuid[])',[posts]);await db.query('alter table public.poll_options enable trigger poll_option_invariants');await db.query('delete from public.polls where post_id=any($1::uuid[])',[posts])
    await db.query('delete from private.moderation_logs where actor_user_id=any($1::uuid[]) or target_user_id=any($1::uuid[])',[users]);await db.query('delete from private.invite_codes where created_by=any($1::uuid[])',[users])
    await db.query('delete from private.content_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.comments where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.post_images where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.posts where id=any($1::uuid[])',[posts]);await db.query('delete from public.categories where id=any($1::uuid[])',[categoryIds]);await db.query('delete from private.character_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.characters where id=any($1::uuid[])',[chars]);await db.query('delete from public.assets where id=any($1::uuid[])',[assetIds])
    await db.query('alter table private.members disable trigger protect_last_admin');await db.query('delete from private.members where user_id=any($1::uuid[])',[users]);await db.query('alter table private.members enable trigger protect_last_admin');await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null)
})
const batch=(ids,who='member',extra={})=>ok(who,'export_batch',{post_ids:ids,...extra})
const expected=rows=>rows.map(r=>({id:r.document.id,checksum:r.checksum}))
test('exports are available to active members and closed to anon, uninvited and suspended callers',async()=>{
  const id=await post('회원 내보내기');assert.equal((await batch([id],'other'))[0].document.title,'회원 내보내기')
  for(const who of ['uninvited','suspended'])for(const [name,args] of [['export_manifest',{}],['export_batch',{post_ids:[id]}],['validate_export',{expected:[{id,checksum:'x'}]}]])assert.ok((await rpc(who,name,args)).error)
  const anon=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.rpc('export_manifest')).error)
  await assert.rejects(asUser(env,actors.member.id,'select private.export_document($1,true,true)',[id]),{code:'42501'})
})
test('export DTO is whitelisted, public content only, independent of administrator privileges',async()=>{
  const visible=await post('정상 글'),hidden=await post('숨긴 비밀'),deleted=await post('삭제 비밀');await ok('operator','moderate_content',{kind:'post',target_id:hidden,expected_version:1,new_status:'moderator_hidden',reason:'검토'});await ok('member','delete_post',{target_id:deleted,expected_version:1})
  const rows=await batch([visible]);assert.deepEqual(Object.keys(rows[0]).sort(),['checksum','document']);const d=rows[0].document
  assert.deepEqual(Object.keys(d).sort(),['author','body','body_text','category','comments','created_at','id','images','notice','poll','title','type','updated_at']);assert.deepEqual(Object.keys(d.author).sort(),['avatar_asset_id','name'])
  for(const who of ['member','operator']){for(const id of [hidden,deleted])assert.equal((await rpc(who,'export_batch',{post_ids:[visible,id]})).error.message,'EXPORT_CHANGED');const m=await ok(who,'export_manifest');assert.ok(!m.items.some(i=>i.id===hidden||i.id===deleted))}
  assert.equal(JSON.stringify(d).includes(actors.member.id),false);assert.equal(JSON.stringify(d).includes(actors.member.email),false)
})
test('poll exports contain only policy-visible results, without personal choices or anonymous identities',async()=>{
  const id=await poll();assert.equal((await vote(id)).error,null)
  for(const who of ['other','operator'])assert.equal((await batch([id],who))[0].document.poll.results,null)
  const own=(await batch([id]))[0].document.poll;assert.equal(own.results.participants,1);assert.deepEqual(own.results.voters,[]);assert.ok(!('my_choices'in own));assert.ok(!('has_voted'in own))
  const named=await poll({anonymous:false,results_policy:'after_close'});assert.equal((await vote(named,'other')).error,null);assert.equal((await batch([named]))[0].document.poll.results,null);await ok('member','close_poll',{target_id:named});const p=(await batch([named]))[0].document.poll;assert.equal(p.results.voters[0].name,'other 모습');assert.deepEqual(Object.keys(p.results.voters[0]).sort(),['avatar_asset_id','choices','name'])
})
test('all comments bypass API row caps while deleted parents keep no original body or author',async()=>{
  const id=await post('많은 댓글'),parent=await ok('member','create_comment',{request_id:randomUUID(),target_post:id,character_id:actors.member.char,comment_body:'제거할 부모 비밀'}),reply=await ok('other','create_comment',{request_id:randomUUID(),target_post:id,character_id:actors.other.char,comment_body:'남길 답글',parent_comment:parent});await ok('member','change_comment',{target_id:parent,expected_version:1,remove:true})
  await db.query("insert into public.comments(post_id,body,author_character_id,author_name_snapshot) select $1,'대량 댓글 '||n,$2,'과거 이름' from generate_series(1,1005) n",[id,actors.member.char])
  const d=(await batch([id]))[0].document;assert.equal(d.comments.length,1007);assert.equal(d.comments.find(c=>c.id===parent).body,null);assert.equal(d.comments.find(c=>c.id===parent).author,null);assert.equal(d.comments.find(c=>c.id===reply).body,'남길 답글');assert.equal(JSON.stringify(d).includes('제거할 부모 비밀'),false);assert.equal((await batch([id],'member',{with_comments:false}))[0].document.comments.length,0)
})
test('over 1000 posts paginate chronologically through every 200-post part with stable tie ordering',async()=>{
  const cat=await ok('operator','save_category',{category_name:'내보내기 대량',position_value:100});categoryIds.push(cat)
  const ids=(await db.query("insert into public.posts(category_id,type,title,body_json,body_text,author_character_id,author_name_snapshot,created_at) select $1,'general','분할 글 '||n,$2::jsonb,'한국어',$3,'과거 모습','2026-01-01T00:00:00Z'::timestamptz from generate_series(1,1005) n returning id",[cat,document,actors.member.char])).rows.map(r=>r.id)
  await db.query("insert into private.content_owners(content_kind,content_id,user_id) select 'post',x,$2 from unnest($1::uuid[]) x",[ids,actors.member.id])
  const all=[];let snapshot;for(;;){const last=all.at(-1),m=await ok('member','export_manifest',{category_filter:cat,snapshot_time:snapshot,after_time:last?.created_at,after_id:last?.id});snapshot=m.snapshot_time;assert.equal(m.total,1005);all.push(...m.items);if(m.items.length<200)break}
  assert.equal(all.length,1005);assert.equal(new Set(all.map(i=>i.id)).size,1005);assert.deepEqual(all.map(i=>i.id),ids.slice().sort())
  const exported=[];for(let n=0;n<all.length;n+=200){const rows=await batch(all.slice(n,n+200).map(i=>i.id));assert.equal(rows.length,Math.min(200,1005-n));exported.push(...rows.map(r=>r.document.id));await ok('member','validate_export',{expected:expected(rows)})}assert.deepEqual(exported,all.map(i=>i.id))
})
test('date and category selection uses inclusive start and exclusive end with input bounds',async()=>{
  const cat=await ok('operator','save_category',{category_name:'기간 검증',position_value:101});categoryIds.push(cat);const id=await post('날짜 글','member',cat),p=await ok('member','get_post',{target_id:id})
  const m=await ok('member','export_manifest',{category_filter:cat,from_time:p.created_at,until_time:new Date(Date.parse(p.created_at)+1000).toISOString()});assert.equal(m.total,1)
  assert.equal((await ok('member','export_manifest',{category_filter:cat,until_time:p.created_at})).total,0)
  assert.equal((await rpc('member','export_manifest',{from_time:'2026-01-02',until_time:'2026-01-01'})).error.message,'INVALID_EXPORT_RANGE')
  for(const ids of [[],[id,id],Array(201).fill(id)])assert.equal((await rpc('member','export_batch',{post_ids:ids})).error.message,'INVALID_EXPORT_BATCH')
})
test('download revalidation rejects post, comment, result and visibility changes after preparation',async()=>{
  for(const change of ['post','comment','hidden','vote']){
    const id=change==='vote'?await poll({results_policy:'always'}):await post('준비한 글'),rows=await batch([id]);await ok('member','validate_export',{expected:expected(rows)})
    if(change==='post')await ok('member','update_post',{target_id:id,expected_version:1,category_id:category,post_title:'바뀐 글',document})
    if(change==='comment')await ok('other','create_comment',{request_id:randomUUID(),target_post:id,character_id:actors.other.char,comment_body:'나중 댓글'})
    if(change==='hidden')await ok('operator','moderate_content',{kind:'post',target_id:id,expected_version:1,new_status:'moderator_hidden',reason:'숨김'})
    if(change==='vote')assert.equal((await vote(id)).error,null)
    assert.equal((await rpc('member','validate_export',{expected:expected(rows)})).error.message,'EXPORT_CHANGED')
  }
})
test('image exclusion strips all snapshot assets and image inclusion preserves immutable references',async()=>{
  const asset=randomUUID();assetIds.push(asset);await db.query("insert into public.assets(id,storage_path,thumbnail_path,mime_type,size_bytes,status) values($1,$2,$3,'image/webp',100,'ready')",[asset,`profiles/${asset}/main.webp`,`profiles/${asset}/thumb.webp`]);await db.query('insert into private.asset_owners(asset_id,user_id) values($1,$2)',[asset,actors.member.id]);const c=(await ok('member','list_my_characters'))[0];await ok('member','update_character',{target_id:c.id,expected_version:c.version,character_name:'기록된 모습',character_bio:'',avatar_id:asset})
  const id=await post('프로필 포함 글');await ok('member','update_character',{target_id:c.id,expected_version:c.version+1,character_name:'변경된 모습',character_bio:'',avatar_id:null})
  assert.equal((await batch([id]))[0].document.author.avatar_asset_id,asset);assert.equal((await batch([id]))[0].document.author.name,'기록된 모습');assert.equal((await batch([id],'member',{with_images:false}))[0].document.author.avatar_asset_id,null)
})
