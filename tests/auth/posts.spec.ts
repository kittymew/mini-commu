import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {ImageMagick,MagickColors,MagickFormat} from '@imagemagick/magick-wasm'
import {initializeImages} from '../../supabase/functions/profile-image/image.mjs'
import {localConfig,connect} from '../../scripts/local-db.mjs'
import type {Database,Json} from '../../src/types/database'
const env=localConfig(),users:string[]=[],categoryIds:string[]=[],categoryNames:string[]=[],password=`Posts-${randomUUID()}!`
const admin=createClient<Database>(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const baseCategory='00000000-0000-0000-0000-000000000001'
let png:Buffer
async function member(operator=false){
  const email=`e2e-posts-${randomUUID()}@example.test`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(r.error).toBeNull();const id=r.data.user!.id;users.push(id)
  const db=await connect(env);try{await db.query('insert into private.members(user_id,role) values($1,$2)',[id,operator?'admin':'member'])}finally{await db.end()}
  const client=createClient<Database>(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email,password})).error).toBeNull()
  const c=await client.rpc('create_character',{character_name:operator?'운영 모습':'첫 모습'});expect(c.error).toBeNull()
  return {id,email,client,char:c.data!}
}
async function login(page:Page,email:string){await page.goto('./#/login');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'모임 피드',exact:true})).toBeVisible()}
async function newPost(page:Page,char:string,title='우리의 이야기'){
  await page.goto('./#/posts/new');await page.getByLabel('현재 캐릭터',{exact:true}).selectOption(char)
  await page.getByLabel('제목',{exact:true}).fill(title);await page.getByLabel('본문 1',{exact:true}).fill('안녕하세요\n함께 남기는 이야기')
}
const bodyDocument=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}) as Json
async function apiPost(account:Awaited<ReturnType<typeof member>>,title='서버에서 쓴 글'){
  const id=randomUUID(),r=await account.client.rpc('create_post',{request_id:id,character_id:account.char,category_id:baseCategory,post_title:title,document:bodyDocument('본문')});expect(r.error).toBeNull();return id
}
test.beforeAll(async()=>{await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))));png=Buffer.from(ImageMagick.read(MagickColors.Orange,60,40,img=>img.write(MagickFormat.Png,b=>Uint8Array.from(b))))})
test.afterAll(async()=>{
  const db=await connect(env)
  try{
    const assets=(await db.query('select a.* from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
    if(assets.length)expect((await admin.storage.from('community').remove(assets.flatMap(a=>[a.storage_path,a.thumbnail_path,`temporary/${a.id}/source`]).filter(Boolean))).error).toBeNull()
    await db.query('begin')
    const posts=(await db.query("select content_id from private.content_owners where content_kind='post' and user_id=any($1::uuid[])",[users])).rows.map(r=>r.content_id)
    const chars=(await db.query('select character_id from private.character_owners where user_id=any($1::uuid[])',[users])).rows.map(r=>r.character_id)
    await db.query('delete from private.content_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.comments where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.post_images where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.posts where id=any($1::uuid[])',[posts])
    await db.query('delete from public.categories where id=any($1::uuid[]) or name=any($2::text[])',[categoryIds,categoryNames]);await db.query('delete from private.character_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.characters where id=any($1::uuid[])',[chars]);await db.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await db.query('alter table private.members disable trigger protect_last_admin');await db.query('delete from private.members where user_id=any($1::uuid[])',[users]);await db.query('alter table private.members enable trigger protect_last_admin');await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()
})

test('draft restoration, structured formatting, four ordered uploads, preview and real publication',async({page})=>{
  const account=await member();await login(page,account.email);await newPost(page,account.char)
  await expect(page.getByRole('status')).toContainText('초안을 저장했습니다')
  await page.reload();await expect(page.getByRole('heading',{name:'저장된 초안이 있어요'})).toBeVisible();await page.getByRole('button',{name:'초안 복원',exact:true}).click()
  await expect(page.getByLabel('제목',{exact:true})).toHaveValue('우리의 이야기')
  await page.getByLabel('본문 1',{exact:true}).fill('<script>alert(1)</script> 안전한 글')
  await page.getByLabel('본문 1',{exact:true}).evaluate((node:HTMLTextAreaElement)=>{node.focus();node.setSelectionRange(0,node.value.length)})
  await page.getByRole('button',{name:'굵게',exact:true}).click()
  await page.getByLabel('문단 1 형식',{exact:true}).selectOption('bullet')
  await page.getByLabel('이미지 추가',{exact:true}).setInputFiles(Array.from({length:4},(_,i)=>({name:`image-${i}.png`,mimeType:'image/png',buffer:png})))
  await expect(page.getByRole('button',{name:'이미지 4 앞으로',exact:true})).toBeEnabled({timeout:20000})
  await expect(page.getByLabel('이미지 추가',{exact:true})).toBeDisabled()
  await expect.poll(async()=>await page.evaluate(id=>(JSON.parse(localStorage.getItem(`mini-commu:draft:${id}:new`)||'{}').images??[]).length,account.id)).toBe(4)
  const uploadedIds=await page.evaluate(id=>JSON.parse(localStorage.getItem(`mini-commu:draft:${id}:new`)!).images as string[],account.id)
  await page.getByRole('button',{name:'이미지 4 앞으로',exact:true}).click()
  await page.getByRole('button',{name:'등록 전 미리보기',exact:true}).click()
  await expect(page.getByRole('article',{name:'글 미리보기'}).locator('strong')).toContainText('안전한 글')
  await expect(page.getByRole('article',{name:'글 미리보기'}).locator('script')).toHaveCount(0)
  await page.getByRole('button',{name:'글 등록',exact:true}).click()
  await expect(page).toHaveURL(/#\/posts\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading',{name:'우리의 이야기',level:1,exact:true})).toBeVisible()
  const publishedId=page.url().split('/posts/')[1],published=(await account.client.rpc('get_post',{target_id:publishedId})).data as {image_ids:string[]};expect(published.image_ids).toEqual([uploadedIds[0],uploadedIds[1],uploadedIds[3],uploadedIds[2]])
  await expect(page.getByRole('button',{name:'이미지 4 확대',exact:true})).toBeVisible()
  await expect(page.locator('.post-images img')).toHaveCount(4)
  await page.getByRole('button',{name:'이미지 1 확대',exact:true}).click();await expect(page.getByRole('dialog',{name:'첨부 이미지 확대'})).toBeVisible();await page.getByRole('button',{name:'확대 닫기',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(await page.evaluate(id=>localStorage.getItem(`mini-commu:draft:${id}:new`),account.id)).toBeNull()
})

test('image failure and lost create response keep input; retry creates exactly one post',async({page})=>{
  const account=await member();await login(page,account.email);await newPost(page,account.char,'재시도 글')
  await page.getByLabel('이미지 추가',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg/>')})
  await expect(page.getByText('정상적인 JPEG·PNG·WebP 이미지를 선택해 주세요.',{exact:true})).toBeVisible()
  await expect(page.getByLabel('제목',{exact:true})).toHaveValue('재시도 글');await expect(page.getByRole('button',{name:'글 등록',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'대기 이미지 제거',exact:true}).click()
  await page.route('**/rest/v1/rpc/create_post',async route=>{await route.fetch();await route.abort('failed')},{times:1})
  await page.getByRole('button',{name:'글 등록',exact:true}).click();await expect(page.getByRole('alert')).toContainText('입력은 유지')
  await expect(page.getByLabel('제목',{exact:true})).toHaveValue('재시도 글');await page.getByRole('button',{name:'글 등록',exact:true}).click()
  await expect(page.getByRole('heading',{name:'재시도 글',exact:true})).toBeVisible()
  const rows=await account.client.from('posts').select('id').eq('title','재시도 글');expect(rows.data).toHaveLength(1)
})

test('another character can edit own post, conflicts preserve input, comments retain a deleted parent placeholder',async({page,browser})=>{
  const owner=await member(),other=await member(),id=await apiPost(owner)
  await login(page,owner.email);await page.goto(`./#/posts/${id}`)
  await page.getByLabel('현재 캐릭터',{exact:true}).selectOption(owner.char)
  await page.getByLabel('댓글 내용',{exact:true}).fill('부모 이야기');await page.getByRole('button',{name:'댓글 등록',exact:true}).click();await expect(page.getByText('부모 이야기',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'댓글 수정',exact:true}).click();await page.getByLabel('댓글 수정 내용',{exact:true}).fill('수정된 부모 이야기');await page.getByRole('button',{name:'댓글 변경 저장',exact:true}).click();await expect(page.getByText('수정된 부모 이야기',{exact:true})).toBeVisible()
  const secondContext=await browser.newContext({baseURL:'http://127.0.0.1:5173/mini-commu/'})
  try{
    const second=await secondContext.newPage();await login(second,other.email);await second.goto(`./#/posts/${id}`);await second.getByLabel('현재 캐릭터',{exact:true}).selectOption(other.char)
    await expect(second.getByRole('link',{name:'글 수정',exact:true})).toHaveCount(0)
    await second.getByRole('button',{name:'답글 달기',exact:true}).click();await second.getByLabel('답글 내용',{exact:true}).fill('남겨진 답글');await second.getByRole('button',{name:'답글 등록',exact:true}).click();await expect(second.getByText('남겨진 답글',{exact:true})).toBeVisible()
    await page.bringToFront()
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('남겨진 답글',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:'댓글 삭제',exact:true}).click();await page.getByRole('button',{name:'댓글 삭제 확정',exact:true}).click();await expect(page.getByText('삭제된 댓글입니다.',{exact:true})).toBeVisible();await expect(page.getByText('수정된 부모 이야기',{exact:true})).toHaveCount(0)
    const char=(await owner.client.rpc('create_character',{character_name:'두번째 모습'})).data!;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByLabel('현재 캐릭터',{exact:true}).selectOption(char)
    await page.getByRole('link',{name:'글 수정',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('내 수정 입력')
    expect((await owner.client.rpc('update_post',{target_id:id,expected_version:1,category_id:baseCategory,post_title:'다른 창 변경',document:bodyDocument('다른 내용')})).error).toBeNull()
    await page.getByRole('button',{name:'변경 저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('다른 곳에서 변경');await expect(page.getByLabel('제목',{exact:true})).toHaveValue('내 수정 입력')
    page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:'최신 글 다시 불러오기',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('다른 창 변경')
    await page.getByLabel('제목',{exact:true}).fill('충돌 해결');await page.getByRole('button',{name:'변경 저장',exact:true}).click();await expect(page.getByRole('heading',{name:'충돌 해결',exact:true})).toBeVisible()
    await expect(page.getByText('첫 모습',{exact:true}).first()).toBeVisible()
    await page.getByRole('button',{name:'글 삭제',exact:true}).click();await page.getByRole('button',{name:'글 삭제 확정',exact:true}).click();await expect(page.getByRole('heading',{name:'모임 피드',exact:true})).toBeVisible()
    await second.reload();await expect(second.getByRole('heading',{name:'볼 수 없는 글입니다',exact:true})).toBeVisible()
  }finally{await secondContext.close()}
})

test('category UI creates, renames, moves posts and protects the final category',async({page})=>{
  const name=`사진-${randomUUID().slice(0,8)}`;categoryNames.push(name)
  const account=await member(true),id=await apiPost(account,'분류 이동 글');await login(page,account.email);await page.getByRole('link',{name:'카테고리 관리',exact:true}).click()
  await page.getByRole('button',{name:'카테고리 추가',exact:true}).click();await page.getByLabel('카테고리 이름',{exact:true}).fill(name);await page.getByLabel('표시 순서',{exact:true}).fill('3');await page.getByRole('button',{name:'카테고리 저장',exact:true}).click()
  await expect(page.getByRole('article',{name:`${name} 카테고리`,exact:true})).toBeVisible()
  const cat=(await account.client.from('categories').select('*').eq('name',name)).data![0];categoryIds.push(cat.id)
  await page.getByRole('article',{name:`${name} 카테고리`,exact:true}).getByRole('button',{name:'수정',exact:true}).click();await page.getByLabel('카테고리 이름',{exact:true}).fill('기록');await page.getByRole('button',{name:'카테고리 저장',exact:true}).click();await expect(page.getByRole('heading',{name:'기록',exact:true})).toBeVisible()
  await page.goto(`./#/posts/${id}`);await page.getByLabel('글 이동 카테고리',{exact:true}).selectOption(cat.id);await page.getByRole('button',{name:'카테고리 이동',exact:true}).click();await expect(page.getByRole('status')).toContainText('카테고리를 변경')
  await page.goto('./#/categories');await page.getByRole('article',{name:'기록 카테고리',exact:true}).getByRole('button',{name:'삭제',exact:true}).click();await page.getByLabel('기존 글을 옮길 카테고리',{exact:true}).selectOption(baseCategory);await page.getByRole('button',{name:'카테고리 삭제 확정',exact:true}).click();await expect(page.getByRole('article',{name:'기록 카테고리',exact:true})).toHaveCount(0)
  await expect(page.getByRole('article',{name:'기본 카테고리',exact:true}).getByRole('button',{name:'삭제',exact:true})).toBeDisabled()
})

test('logout clears real drafts and the next account cannot restore them',async({page})=>{
  const account=await member(),other=await member();await login(page,account.email);await newPost(page,account.char,'지워질 초안');await expect(page.getByRole('status')).toContainText('초안을 저장했습니다')
  await page.goto('./#/settings');await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mini-commu:draft:')))).toEqual([])
  await login(page,other.email);await page.goto('./#/posts/new');await expect(page.getByLabel('제목',{exact:true})).toHaveValue('');await expect(page.getByRole('heading',{name:'저장된 초안이 있어요'})).toHaveCount(0)
})


test('feed loads another page and removes newly hidden content on refresh',async({page})=>{
  const account=await member(true);const ids:string[]=[]
  const category=(await account.client.rpc('save_category',{category_name:'페이지 분류',position_value:9})).data!;categoryIds.push(category)
  for(let i=0;i<23;i++){const id=randomUUID();expect((await account.client.rpc('create_post',{request_id:id,character_id:account.char,category_id:category,post_title:`페이지글 ${i}`,document:bodyDocument('본문')})).error).toBeNull();ids.push(id)}
  await login(page,account.email)
  await page.getByLabel('카테고리',{exact:true}).selectOption(category)
  await expect(page.locator('.feed-card')).toHaveCount(20)
  await page.getByRole('button',{name:'더 불러오기',exact:true}).click()
  await expect(page.locator('.feed-card')).toHaveCount(23)
  const db=await connect(env);try{await db.query("update public.posts set status='moderator_hidden' where id=$1",[ids[0]])}finally{await db.end()}
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('link',{name:'페이지글 0',exact:true})).toHaveCount(0)
  await expect(page.locator('.feed-card')).toHaveCount(22)
})

test('the same account can find and edit its post from an independent device session',async({page,browser})=>{
  const account=await member(),id=await apiPost(account,'다른 기기에서 이어 쓰는 글')
  await login(page,account.email);await page.goto(`./#/posts/${id}`);await expect(page.getByRole('heading',{name:'다른 기기에서 이어 쓰는 글',exact:true})).toBeVisible()
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5173/mini-commu/'})
  try{
    const second=await context.newPage();await login(second,account.email);await second.getByRole('link',{name:/다른 기기에서 이어 쓰는 글/}).click();await expect(second).toHaveURL(new RegExp(`#\\/posts\\/${id}$`))
    await second.getByRole('link',{name:'글 수정',exact:true}).click();await second.getByLabel('제목',{exact:true}).fill('두 번째 기기에서 저장한 글');await second.getByRole('button',{name:'변경 저장',exact:true}).click();await expect(second.getByRole('heading',{name:'두 번째 기기에서 저장한 글',exact:true})).toBeVisible()
    await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'두 번째 기기에서 저장한 글',exact:true})).toBeVisible();await expect(page.getByText('첫 모습',{exact:true}).first()).toBeVisible()
  }finally{await context.close()}
})
