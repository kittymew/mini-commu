import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {localConfig,connect} from '../../scripts/local-db.mjs'
import type {Database,Json} from '../../src/types/database'
const env=localConfig(),users:string[]=[],categoryIds:string[]=[],categoryNames:string[]=[],password=`Posts-${randomUUID()}!`
const admin=createClient<Database>(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const baseCategory='00000000-0000-0000-0000-000000000001'
async function member(operator=false){
  const email=`e2e-community-${randomUUID()}@example.test`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(r.error).toBeNull();const id=r.data.user!.id;users.push(id)
  const db=await connect(env);try{await db.query('insert into private.members(user_id,role) values($1,$2)',[id,operator?'admin':'member'])}finally{await db.end()}
  const client=createClient<Database>(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email,password})).error).toBeNull()
  const c=await client.rpc('create_character',{character_name:operator?'운영 모습':'첫 모습'});expect(c.error).toBeNull()
  return {id,email,client,char:c.data!}
}
async function login(page:Page,email:string){await page.goto('./#/login');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'모임 피드',exact:true})).toBeVisible()}
const bodyDocument=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}) as Json
async function apiPost(account:Awaited<ReturnType<typeof member>>,title='서버에서 쓴 글'){
  const id=randomUUID(),r=await account.client.rpc('create_post',{request_id:id,character_id:account.char,category_id:baseCategory,post_title:title,document:bodyDocument('본문')});expect(r.error).toBeNull();return id
}
test.afterAll(async()=>{
  const db=await connect(env)
  try{
    const assets=(await db.query('select a.* from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
    if(assets.length)expect((await admin.storage.from('community').remove(assets.flatMap(a=>[a.storage_path,a.thumbnail_path,`temporary/${a.id}/source`]).filter(Boolean))).error).toBeNull()
    await db.query('begin')
    const posts=(await db.query("select content_id from private.content_owners where content_kind='post' and user_id=any($1::uuid[])",[users])).rows.map(r=>r.content_id)
    const chars=(await db.query('select character_id from private.character_owners where user_id=any($1::uuid[])',[users])).rows.map(r=>r.character_id)
    await db.query('delete from private.poll_vote_choices where poll_id=any($1::uuid[])',[posts]);await db.query('delete from private.poll_votes where poll_id=any($1::uuid[])',[posts]);await db.query('alter table public.poll_options disable trigger poll_option_invariants');await db.query('delete from public.poll_options where poll_id=any($1::uuid[])',[posts]);await db.query('alter table public.poll_options enable trigger poll_option_invariants');await db.query('delete from public.polls where post_id=any($1::uuid[])',[posts]);await db.query('delete from private.moderation_logs where actor_user_id=any($1::uuid[]) or target_user_id=any($1::uuid[])',[users]);await db.query('delete from private.invite_codes where created_by=any($1::uuid[])',[users]);
    await db.query('delete from private.content_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.comments where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.post_images where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.posts where id=any($1::uuid[])',[posts])
    await db.query('delete from public.categories where id=any($1::uuid[]) or name=any($2::text[])',[categoryIds,categoryNames]);await db.query('delete from private.character_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.characters where id=any($1::uuid[])',[chars]);await db.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await db.query('alter table private.members disable trigger protect_last_admin');await db.query('delete from private.members where user_id=any($1::uuid[])',[users]);await db.query('alter table private.members enable trigger protect_last_admin');await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()
})

test('poll draft, pre-vote editing, named multiselect revote and first character snapshot',async({page},info)=>{
  const account=await member(),second=(await account.client.rpc('create_character',{character_name:'다른 모습'})).data!
  await login(page,account.email);await page.goto('./#/posts/new');await page.getByLabel('현재 캐릭터',{exact:true}).selectOption(account.char);await page.getByLabel('글 형식',{exact:true}).selectOption('poll')
  await page.getByLabel('제목',{exact:true}).fill('다음 모임 장소');await page.getByLabel('투표 질문',{exact:true}).fill('어디에서 만날까요?');await page.getByLabel('선택지 1',{exact:true}).fill('서울');await page.getByLabel('선택지 2',{exact:true}).fill('부산');await page.getByLabel('복수 선택',{exact:true}).check();await page.getByLabel('익명 투표',{exact:true}).uncheck();await page.getByLabel('재투표 허용',{exact:true}).check()
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`mini-commu:draft:${id}:new`)||'{}').poll?.allow_revote,account.id)).toBe(true)
  await page.reload();await page.getByRole('button',{name:'초안 복원',exact:true}).click();await expect(page.getByLabel('복수 선택',{exact:true})).toBeChecked();await expect(page.getByLabel('익명 투표',{exact:true})).not.toBeChecked()
  await page.getByRole('button',{name:'등록 전 미리보기',exact:true}).click();await expect(page.getByRole('article',{name:'글 미리보기'})).toContainText('어디에서 만날까요?')
  await page.getByRole('button',{name:'글 등록',exact:true}).click();await expect(page.getByRole('heading',{name:'다음 모임 장소',level:1})).toBeVisible()
  const panel=page.getByRole('region',{name:'투표',exact:true});await expect(panel).toContainText('결과는 참여 후 공개됩니다.');await panel.getByRole('button',{name:'투표 설정 수정',exact:true}).click();await panel.getByLabel('투표 질문',{exact:true}).fill('모임 장소를 골라 주세요');await panel.getByRole('button',{name:'투표 설정 저장',exact:true}).click();await expect(panel.getByRole('heading',{name:'모임 장소를 골라 주세요'})).toBeVisible()
  await panel.getByLabel('서울',{exact:true}).check();await panel.getByLabel('부산',{exact:true}).check();await panel.getByRole('button',{name:'투표하기',exact:true}).click();await expect(panel.getByRole('heading',{name:'투표 결과 · 1명 참여'})).toBeVisible();await expect(panel).toContainText('합계는 100%를 넘을 수');await expect(panel.getByRole('button',{name:'투표 설정 수정',exact:true})).toHaveCount(0)
  await panel.getByLabel('현재 캐릭터',{exact:true}).selectOption(second);await panel.getByLabel('서울',{exact:true}).uncheck();await panel.getByRole('button',{name:'재투표',exact:true}).click();await expect(panel).toContainText('서울 · 0표');await expect(panel).toContainText('첫 모습 · 부산');await expect(panel).not.toContainText('다른 모습 · 부산')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  if(process.env.COMMUNITY_SCREENSHOT)await page.screenshot({path:`/private/tmp/mini-commu-stage6-poll-${info.project.name}.png`,fullPage:true})
})
test('anonymous after-close result stays hidden until owner confirms early close',async({page})=>{
  const owner=await member(),voter=await member(),id=randomUUID()
  const created=await owner.client.rpc('create_poll_post',{request_id:id,character_id:owner.char,category_id:baseCategory,post_title:'익명 투표',document:bodyDocument('함께 골라요'),settings:{question:'어느 계절?',options:['봄','가을'],multiple:false,anonymous:true,allow_revote:false,results_policy:'after_close',closes_at:null}});expect(created.error).toBeNull()
  const p=(await voter.client.rpc('get_poll',{target_id:id})).data as {options:{id:string}[]};expect((await voter.client.rpc('submit_vote',{target_id:id,character_id:voter.char,option_ids:[p.options[0].id]})).error).toBeNull()
  await login(page,owner.email);await page.goto(`./#/posts/${id}`);const panel=page.getByRole('region',{name:'투표',exact:true});await expect(panel).toContainText('결과는 마감 후 공개됩니다.');await expect(panel.getByRole('heading',{name:/투표 결과/})).toHaveCount(0)
  await panel.getByRole('button',{name:'투표 조기 마감',exact:true}).click();await panel.getByRole('button',{name:'마감 확정',exact:true}).click();await expect(panel.getByRole('heading',{name:'투표 결과 · 1명 참여'})).toBeVisible();await expect(panel).toContainText('봄 · 1표 (100%)');await expect(panel.getByRole('button',{name:'투표하기',exact:true})).toHaveCount(0);await expect(panel.locator('.author-line')).toHaveCount(0)
})
test('notice and pin, Korean search, account activity and moderation remain consistent',async({page})=>{
  const operator=await member(true),id=await apiPost(operator,'모임 공지 검색'),other=await apiPost(operator,'일반 이야기')
  await login(page,operator.email);await page.goto(`./#/posts/${id}`);await page.getByText('공지와 고정 관리',{exact:true}).click();await page.getByLabel('공지로 표시',{exact:true}).check();await page.getByLabel('고정 범위',{exact:true}).selectOption('global');await page.getByLabel('공지 변경 사유',{exact:true}).fill('모임 일정 안내');await page.getByRole('button',{name:'공지와 고정 저장',exact:true}).click();await expect(page.getByText('공지와 고정을 저장했습니다.',{exact:true})).toBeVisible()
  await page.goto('./#/feed');await expect(page.locator('.feed-card').first()).toContainText('모임 공지 검색');await page.getByLabel('공지 모아보기',{exact:true}).click();await expect(page.getByLabel('공지 모아보기',{exact:true})).toBeChecked();await expect(page.locator('.feed-card')).toHaveCount(1);await page.getByLabel('제목·본문 검색',{exact:true}).fill('공지 검');await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('.feed-card')).toHaveCount(1)
  await page.getByRole('link',{name:'내 활동',exact:true}).click();await expect(page.getByRole('link',{name:'모임 공지 검색',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'일반 이야기',exact:true})).toBeVisible()
  await page.goto(`./#/posts/${id}`);await page.getByText('게시글 운영 조치',{exact:true}).click();await page.getByLabel('조치 사유',{exact:true}).fill('안내 내용 검토');await page.getByRole('button',{name:'운영 조치 적용',exact:true}).click();await expect(page.getByRole('heading',{name:'볼 수 없는 글입니다',exact:true})).toBeVisible()
  await page.goto('./#/activity');await expect(page.getByRole('link',{name:'일반 이야기',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'모임 공지 검색',exact:true})).toHaveCount(0)
  await page.getByRole('link',{name:'운영',exact:true}).click();await page.getByRole('button',{name:'조치 기록',exact:true}).click();await expect(page.getByText('사유: 안내 내용 검토',{exact:true})).toBeVisible();await page.getByRole('button',{name:'숨김·삭제',exact:true}).click();const target=page.locator('.admin-card').filter({hasText:id});await target.getByText('게시글 운영 조치',{exact:true}).click();await target.getByLabel('조치',{exact:true}).selectOption('published');await target.getByLabel('조치 사유',{exact:true}).fill('검토 완료');await target.getByRole('button',{name:'운영 조치 적용',exact:true}).click();await expect(target).toHaveCount(0)
  await page.goto(`./#/posts/${id}`);await expect(page.getByRole('heading',{name:'공지 모임 공지 검색',exact:true})).toBeVisible();expect(other).toBeTruthy()
})
test('operator issues, edits and revokes invitations, manages memberships and reads audit reasons',async({page})=>{
  const operator=await member(true),target=await member();await login(page,operator.email);await page.getByRole('link',{name:'운영',exact:true}).click();await page.getByRole('button',{name:'초대 코드 발급',exact:true}).click();await expect(page.locator('.invite-code')).toHaveText(/^[0-9a-f]{64}$/)
  const invite=page.locator('.admin-card').filter({has:page.getByRole('button',{name:'초대 변경 저장',exact:true})}).first();await invite.getByLabel('초대 사용 한도',{exact:true}).fill('2');await invite.getByRole('button',{name:'초대 변경 저장',exact:true}).click();await expect(invite).toContainText('0/2회 사용');await invite.getByRole('button',{name:'초대 폐기',exact:true}).click();await expect(page.getByText(/폐기됨/)).toBeVisible()
  await page.getByRole('button',{name:'회원 관리',exact:true}).click();const card=page.locator('.admin-card').filter({has:page.getByRole('heading',{name:target.email,exact:true})});await card.getByLabel('회원 조치 사유',{exact:true}).fill('운영 참여');await card.getByRole('button',{name:'운영자 지정',exact:true}).click();await expect(card.getByRole('button',{name:'운영자 해제',exact:true})).toBeVisible();await card.getByLabel('회원 조치 사유',{exact:true}).fill('활동 일시 중지');await card.getByRole('button',{name:'이용 정지',exact:true}).click();await expect(card.getByRole('button',{name:'이용 재개',exact:true})).toBeVisible();await card.getByLabel('회원 조치 사유',{exact:true}).fill('활동 재개');await card.getByRole('button',{name:'이용 재개',exact:true}).click();await expect(card.getByRole('button',{name:'이용 정지',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'조치 기록',exact:true}).click();await expect(page.getByText('사유: 운영 참여',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
