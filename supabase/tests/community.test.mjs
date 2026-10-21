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
async function pin(id,scope='global',position=0,notice=true){const p=await ok('operator','get_post',{target_id:id});return ok('operator','set_post_notice',{target_id:id,expected_version:p.version,is_notice:notice,scope,pin_position:position,reason:'상단 안내'})}
before(async()=>{
  for(const name of ['member','other','operator','secondadmin','suspended','uninvited']){
    const email=`stage6-${randomUUID()}@example.test`,password=`Test-${randomUUID()}!`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);const id=r.data.user.id;users.push(id)
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
test('poll creation validates configuration atomically and retries preserve one post',async()=>{
  for(const invalid of [null,settings({options:['one']}),settings({options:Array(11).fill('x')}),settings({question:'x'.repeat(101)}),settings({anonymous:'false'}),settings({options:[1,2]}),settings({results_policy:'secret'}),settings({closes_at:'2000-01-01'})]){
    const id=randomUUID(),r=await rpc('member','create_poll_post',{request_id:id,character_id:actors.member.char,category_id:category,post_title:'invalid',document,settings:invalid});assert.ok(r.error);assert.equal((await db.query('select 1 from public.posts where id=$1',[id])).rowCount,0)
  }
  const id=randomUUID(),args={request_id:id,character_id:actors.member.char,category_id:category,post_title:'retry',document,settings:settings()};const r=await Promise.all([ok('member','create_poll_post',args),ok('member','create_poll_post',args)]);assert.deepEqual(r,[id,id])
})
test('simultaneous votes across characters serialize to one account participation',async()=>{
  const id=await poll(),p=await get(id),otherChar=await ok('member','create_character',{character_name:'두 번째 모습'})
  const results=await Promise.all([vote(id,'member',[p.options[0].id]),vote(id,'member',[p.options[1].id],otherChar)])
  assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.find(r=>r.error).error.message,'ALREADY_VOTED')
  assert.equal((await get(id)).participants,1);assert.equal((await get(id)).options.reduce((n,o)=>n+o.count,0),1)
  assert.equal((await db.query('select * from private.poll_votes where poll_id=$1',[id])).rows[0].author_character_id,null)
})
test('multiselect revotes replace choices atomically and retain first named snapshot',async()=>{
  const id=await poll({multiple:true,anonymous:false,allow_revote:true,results_policy:'always'}),p=await get(id),otherChar=await ok('member','create_character',{character_name:'기명 변경 모습'})
  assert.equal((await vote(id,'member',p.options.slice(0,2).map(o=>o.id))).error,null)
  assert.equal((await vote(id,'member',[p.options[2].id],otherChar)).error,null)
  const result=await get(id);assert.equal(result.participants,1);assert.deepEqual(result.options.map(o=>o.count),[0,0,1]);assert.equal(result.voters[0].name,'member 모습');assert.equal(result.voters[0].choices[0],p.options[2].id)
  const results=await Promise.all([vote(id,'member',p.options.slice(0,2).map(o=>o.id)),vote(id,'member',p.options.slice(1).map(o=>o.id))]);assert.ok(results.every(r=>!r.error));assert.equal((await get(id)).participants,1);assert.equal((await get(id)).options.reduce((n,o)=>n+o.count,0),2)
})
test('invalid, duplicate, cross-poll and unauthorized choices cannot change a vote',async()=>{
  const id=await poll(),p=await get(id),foreign=await get(await poll())
  for(const choices of [[],[null],[p.options[0].id,p.options[0].id],p.options.slice(0,2).map(o=>o.id),[foreign.options[0].id]])assert.equal((await vote(id,'member',choices)).error.message,'INVALID_CHOICES')
  assert.equal((await vote(id,'member',undefined,actors.other.char)).error.message,'CHARACTER_NOT_OWNED');assert.equal((await get(id)).has_voted,false)
})
test('result policies and anonymous privacy apply to members, admins and direct APIs',async()=>{
  for(const policy of ['always','after_vote','after_close']){
    const id=await poll({results_policy:policy}),p=await get(id);assert.equal((await vote(id)).error,null)
    for(const who of ['other','operator']){const r=await get(id,who);assert.equal(r.results_visible,policy==='always');assert.equal(r.participants,policy==='always'?1:null);assert.ok(r.options.every(o=>o.count===(policy==='always'?1:null)||o.count===(policy==='always'?0:null)));assert.deepEqual(r.voters,[]);assert.equal(JSON.stringify(r).includes(actors.member.id),false)
      await assert.rejects(asUser(env,actors[who].id,'select * from private.poll_votes'),{code:'42501'});await assert.rejects(asUser(env,actors[who].id,'select * from private.poll_vote_choices'),{code:'42501'})}
    assert.equal((await get(id)).results_visible,policy!=='after_close');await ok('operator','close_poll',{target_id:id});assert.equal((await get(id,'other')).results_visible,policy!=='after_vote')
    for(const who of ['suspended','uninvited'])assert.ok((await rpc(who,'get_poll',{target_id:id})).error)
    assert.ok(p.options.length===3)
  }
})
test('first participation freezes configuration, racing edits remain consistent, body stays editable',async()=>{
  const id=await poll();await ok('member','update_poll',{target_id:id,expected_version:1,settings:settings({question:'수정 질문'})});const p=await get(id)
  const results=await Promise.all([rpc('member','update_poll',{target_id:id,expected_version:2,settings:settings({question:'경합 질문'})}),vote(id,'other',[p.options[0].id])]);assert.ok(results.some(r=>!r.error))
  if(!results[1].error){assert.equal(results[0].error?.message,'POLL_FROZEN')}else{assert.equal(results[1].error.message,'INVALID_CHOICES');assert.equal((await vote(id,'other')).error,null)}
  const postData=await ok('member','get_post',{target_id:id});assert.equal((await rpc('member','update_poll',{target_id:id,expected_version:postData.version,settings:settings()})).error.message,'POLL_FROZEN')
  await ok('member','update_post',{target_id:id,expected_version:postData.version,category_id:category,post_title:'본문 계속 수정',document});await assert.rejects(db.query("update public.polls set anonymous=not anonymous where post_id=$1",[id]),/POLL_FROZEN/)
})
test('server deadline, early close and concurrent closing prevent reopening or late voting',async()=>{
  const id=await poll({closes_at:new Date(Date.now()+1000).toISOString()});await new Promise(r=>setTimeout(r,1100));assert.equal((await vote(id)).error.message,'POLL_CLOSED');assert.equal((await rpc('member','update_poll',{target_id:id,expected_version:1,settings:settings()})).error.message,'POLL_CLOSED')
  const early=await poll();assert.equal((await rpc('other','close_poll',{target_id:early})).error.message,'CONTENT_NOT_OWNED');const results=await Promise.all([rpc('operator','close_poll',{target_id:early}),vote(early)]);assert.equal(results[0].error,null);assert.ok(!results[1].error||results[1].error.message==='POLL_CLOSED');assert.equal((await vote(early,'other')).error.message,'POLL_CLOSED');await assert.rejects(db.query('update public.polls set closed_at=null where post_id=$1',[early]),/POLL_CLOSED/)
})
test('named voter avatar stays readable after profile changes only when results are public',async()=>{
  const asset=randomUUID();assetIds.push(asset);await db.query("insert into public.assets(id,storage_path,thumbnail_path,mime_type,size_bytes,status) values($1,$2,$3,'image/webp',100,'ready')",[asset,`profiles/${asset}/main.webp`,`profiles/${asset}/thumb.webp`]);await db.query('insert into private.asset_owners(asset_id,user_id) values($1,$2)',[asset,actors.other.id])
  const c=(await ok('other','list_my_characters'))[0];await ok('other','update_character',{target_id:c.id,expected_version:c.version,character_name:c.name,character_bio:'',avatar_id:asset})
  const id=await poll({anonymous:false,results_policy:'after_close'});assert.equal((await vote(id,'other')).error,null)
  await ok('other','update_character',{target_id:c.id,expected_version:c.version+1,character_name:c.name,character_bio:'',avatar_id:null})
  assert.deepEqual(await ok('member','get_asset_paths',{asset_ids:[asset]}),[]);await ok('member','close_poll',{target_id:id});assert.equal((await get(id)).voters[0].avatar_asset_id,asset);assert.equal((await ok('member','get_asset_paths',{asset_ids:[asset]})).length,1)
})
test('pin rank and stable cursors paginate without duplicates; Korean search and filters compose',async()=>{
  const cat=await ok('operator','save_category',{category_name:'6단계 검색',position_value:20});categoryIds.push(cat)
  const ids=[];for(let i=0;i<24;i++)ids.push(await post(`고유한국어-${i}`,'member',cat))
  await pin(ids[0],'global',2);await pin(ids[1],'global',1);await pin(ids[2],'category',0)
  const args={query_text:'고유한국어'},first=await ok('other','browse_posts',args),second=await ok('other','browse_posts',{...args,cursor:first.at(-1).cursor});const all=[...first,...second];assert.equal(all.length,24);assert.equal(new Set(all.map(p=>p.id)).size,24);assert.deepEqual(first.slice(0,2).map(p=>p.id),[ids[1],ids[0]])
  const inCategory=await ok('other','browse_posts',{...args,category_filter:cat});assert.equal(inCategory[0].id,ids[2]);assert.equal(inCategory.filter(p=>p.pinned).length,1)
  const notices=await ok('other','browse_posts',{...args,notice_only:true});assert.equal(notices.length,3)
  assert.equal((await ok('other','browse_posts',{...args,type_filter:'poll'})).length,0);assert.equal((await ok('other','browse_posts',{...args,character_filter:actors.other.char})).length,0)
  assert.ok((await ok('other','browse_posts',{query_text:'부분 일치',category_filter:cat})).length);assert.equal((await ok('other','browse_posts',{query_text:'%'})).length,0)
  const denied=await rpc('member','set_post_notice',{target_id:ids[0],expected_version:2,is_notice:false,scope:'none',pin_position:0,reason:'우회'});assert.equal(denied.error.message,'ADMIN_REQUIRED')
})
test('moderation removes all ordinary access, preserves reasons and keeps deletion irreversible',async()=>{
  const id=await post('운영 비공개 대상'),comment=await ok('member','create_comment',{request_id:randomUUID(),target_post:id,character_id:actors.member.char,comment_body:'숨길 댓글'})
  const args={kind:'post',target_id:id,expected_version:1,new_status:'moderator_hidden',reason:'검토 사유'}
  assert.equal((await rpc('member','moderate_content',args)).error.message,'ADMIN_REQUIRED');await ok('operator','moderate_content',args)
  for(const who of ['member','other','operator']){assert.equal(await ok(who,'get_post',{target_id:id}),null);assert.equal((await ok(who,'browse_posts',{query_text:'운영 비공개 대상'})).length,0);assert.ok(!(await ok(who,'list_my_activity')).some(p=>p.id===id));assert.equal((await actors[who].client.from('posts').select('id').eq('id',id)).data.length,0)}
  const hidden=await ok('operator','list_hidden_content');assert.ok(hidden.some(x=>x.id===id));assert.equal(JSON.stringify(hidden).includes('운영 비공개 대상'),false)
  await ok('operator','moderate_content',{...args,expected_version:2,new_status:'published'});await ok('operator','moderate_content',{kind:'comment',target_id:comment,expected_version:1,new_status:'moderator_hidden',reason:'댓글 검토'});assert.equal((await ok('member','list_my_activity',{kind_filter:'comment'})).length,0)
  await ok('operator','moderate_content',{...args,expected_version:3,new_status:'moderator_deleted'});assert.equal((await rpc('operator','moderate_content',{...args,expected_version:4,new_status:'published'})).error.message,'CONTENT_UNAVAILABLE')
  assert.ok((await ok('operator','list_admin_logs')).some(l=>l.target_id===id&&l.reason==='검토 사유'));assert.equal((await rpc('member','list_admin_logs')).error.message,'ADMIN_REQUIRED')
})
test('my activity uses account ownership, character filters, and excludes author-deleted content',async()=>{
  const oldChar=await ok('member','create_character',{character_name:'이전 활동 모습'}),oldPost=randomUUID();await ok('member','create_post',{request_id:oldPost,character_id:oldChar,category_id:category,post_title:'이전 모습의 글',document});await ok('member','set_character_status',{target_id:oldChar,expected_version:1,new_status:'deleted'});assert.ok((await ok('member','list_activity_characters')).some(c=>c.id===oldChar));assert.ok((await ok('member','list_my_activity',{character_filter:oldChar})).some(p=>p.id===oldPost))
  const id=await post('내 계정 활동'),c=await ok('member','create_comment',{request_id:randomUUID(),target_post:id,character_id:actors.member.char,comment_body:'내 댓글 활동'})
  const rows=await ok('member','list_my_activity',{character_filter:actors.member.char});assert.ok(rows.some(x=>x.id===id));assert.ok(!(await ok('other','list_my_activity')).some(x=>x.id===id));assert.ok((await ok('member','list_my_activity',{kind_filter:'comment'})).some(x=>x.id===c))
  await ok('member','delete_post',{target_id:id,expected_version:1});assert.ok(!(await ok('member','list_my_activity')).some(x=>x.id===id));assert.ok(!(await ok('member','list_my_activity',{kind_filter:'comment'})).some(x=>x.id===c))
})
test('administration lists are privileged and revoked operators lose mutation access',async()=>{
  for(const name of ['list_members','list_hidden_content','list_admin_logs','list_invites'])assert.ok((await rpc('member',name)).error)
  const members=await ok('operator','list_members');assert.ok(members.some(m=>m.id===actors.other.id&&m.email===actors.other.email))
  const issued=await ok('operator','issue_invite');assert.equal(issued.length,1);const invite=(await ok('operator','list_invites')).find(i=>i.id===issued[0].invite_id);assert.equal('code'in invite,false)
  await ok('operator','update_invite',{target_id:invite.id,expiry:invite.expires_at,use_limit:2,revoke_code:true});assert.ok((await ok('operator','list_invites')).find(i=>i.id===invite.id).revoked_at)
  await ok('operator','change_member_role',{target_user_id:actors.secondadmin.id,new_role:'member',reason:'권한 회수 검증'});assert.equal((await rpc('secondadmin','issue_invite')).error.message,'ADMIN_REQUIRED')
  assert.equal((await rpc('operator','change_member_status',{target_user_id:actors.operator.id,new_status:'suspended',reason:'마지막 운영자'})).error.message,'LAST_ACTIVE_ADMIN')
})
