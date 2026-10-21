import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {unzipSync,strFromU8} from 'fflate'
import {createProfileHandler} from '../../supabase/functions/profile-image/handler.mjs'
import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
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
  const email=`e2e-exports-${randomUUID()}@example.test`,r=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(r.error).toBeNull();const id=r.data.user!.id;users.push(id)
  const db=await connect(env);try{await db.query('insert into private.members(user_id,role) values($1,$2)',[id,operator?'admin':'member'])}finally{await db.end()}
  const client=createClient<Database>(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});expect((await client.auth.signInWithPassword({email,password})).error).toBeNull()
  const c=await client.rpc('create_character',{character_name:operator?'운영 모습':'첫 모습'});expect(c.error).toBeNull()
  return {id,email,client,char:c.data!}
}
async function login(page:Page,email:string){await page.goto('./#/login');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'모임 피드',exact:true})).toBeVisible()}
const bodyDocument=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}) as Json
async function apiPost(account:Awaited<ReturnType<typeof member>>,title='서버에서 쓴 글',category=baseCategory,images:string[]=[],text='본문'){
  const id=randomUUID(),r=await account.client.rpc('create_post',{request_id:id,character_id:account.char,category_id:category,post_title:title,document:bodyDocument(text),image_ids:images});expect(r.error).toBeNull();return id
}
test.beforeAll(async()=>{await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))));png=Buffer.from(ImageMagick.read(MagickColors.Orange,600,400,img=>img.write(MagickFormat.Png,b=>Uint8Array.from(b))))})
test.afterAll(async()=>{
  const db=await connect(env)
  try{
    const assets=(await db.query('select a.* from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
    if(assets.length)expect((await admin.storage.from('community').remove(assets.flatMap(a=>[a.storage_path,a.thumbnail_path,`temporary/${a.id}/source`]).filter(Boolean))).error).toBeNull()
    await db.query('begin')
    const posts=(await db.query("select content_id from private.content_owners where content_kind='post' and user_id=any($1::uuid[])",[users])).rows.map(r=>r.content_id)
    const chars=(await db.query('select character_id from private.character_owners where user_id=any($1::uuid[])',[users])).rows.map(r=>r.character_id)
    await db.query('delete from private.moderation_logs where actor_user_id=any($1::uuid[]) or target_user_id=any($1::uuid[])',[users]);
    await db.query('delete from private.content_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.comments where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.post_images where post_id=any($1::uuid[])',[posts]);await db.query('delete from public.posts where id=any($1::uuid[])',[posts])
    await db.query('delete from public.categories where id=any($1::uuid[]) or name=any($2::text[])',[categoryIds,categoryNames]);await db.query('delete from private.character_owners where user_id=any($1::uuid[])',[users]);await db.query('delete from public.characters where id=any($1::uuid[])',[chars]);await db.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await db.query('alter table private.members disable trigger protect_last_admin');await db.query('delete from private.members where user_id=any($1::uuid[])',[users]);await db.query('alter table private.members enable trigger protect_last_admin');await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()
})

async function category(){const name=`내보내기-${randomUUID()}`,db=await connect(env),id=randomUUID();categoryIds.push(id);try{await db.query('insert into public.categories(id,name) values($1,$2)',[id,name])}finally{await db.end()}return id}
async function upload(account:Awaited<ReturnType<typeof member>>,kind:'post'|'profile'='post'){
  const handler=createProfileHandler({url:env.API_URL,publicKey:env.ANON_KEY,serviceKey:env.SERVICE_ROLE_KEY,origins:[],kind}),token=(await account.client.auth.getSession()).data.session!.access_token,r=await handler(new Request('http://127.0.0.1/image',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},body:Uint8Array.from(png).buffer}));expect(r.status).toBe(200);return (await r.json()).assetId as string
}
async function setup(page:Page,email:string,cat:string,format='json'){await login(page,email);await page.goto('./#/exports');await page.getByLabel('내보낼 카테고리',{exact:true}).selectOption(cat);await page.getByLabel('저장 형식',{exact:true}).selectOption(format)}
async function download(page:Page,name:string){const received=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const file=await received;expect(await file.failure()).toBeNull();return {name:file.suggestedFilename(),bytes:await readFile((await file.path())!)}}

test('member ZIP contains actual attachment and historic avatar files with relative paths and no private keys',async({page})=>{
  const account=await member(),cat=await category(),attachment=await upload(account),avatar=await upload(account,'profile');expect((await account.client.rpc('update_character',{target_id:account.char,expected_version:1,character_name:'기록 당시 모습',character_bio:'',avatar_id:avatar})).error).toBeNull()
  const id=await apiPost(account,'이미지 보관',cat,[attachment]);expect((await account.client.rpc('update_character',{target_id:account.char,expected_version:2,character_name:'현재 모습',character_bio:'',avatar_id:undefined})).error).toBeNull()
  await setup(page,account.email,cat);await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true})).toBeEnabled();const file=await download(page,'이미지 ZIP 다운로드'),zip=unzipSync(file.bytes),json=JSON.parse(strFromU8(zip['archive.json']));expect(file.name).toMatch(/001-of-001.zip$/);expect(json.posts[0].id).toBe(id);expect(json.posts[0].author.name).toBe('기록 당시 모습');expect(json.post_count).toBe(1)
  for(const path of [json.posts[0].author.avatar,json.posts[0].images[0].path]){expect(path).toMatch(/^images\/[0-9a-f-]+-(avatar|image)\.webp$/);expect(strFromU8(zip[path].slice(0,4))).toBe('RIFF');expect(strFromU8(zip[path].slice(8,12))).toBe('WEBP')}
  const text=JSON.stringify(json);for(const key of ['avatar_asset_id','checksum','storage_path','user_id','my_choices',account.id,account.email,'blob:','http://127.0.0.1'])expect(text).not.toContain(key)
  await expect(page.getByText(/마지막 분할까지 1개의 글을 모두 전달/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('1005 posts download in six files without missing or duplicate IDs, including the final five',async({page})=>{
  test.setTimeout(120000);const account=await member(),cat=await category(),db=await connect(env);let ids:string[]
  try{ids=(await db.query("insert into public.posts(category_id,type,title,body_json,body_text,author_character_id,author_name_snapshot,created_at) select $1,'general','대량 아카이브 '||n,$2::jsonb,'본문',$3,'당시 모습','2026-01-01T00:00:00Z'::timestamptz from generate_series(1,1005) n returning id",[cat,bodyDocument('한글 본문'),account.char])).rows.map(r=>r.id);await db.query("insert into private.content_owners(content_kind,content_id,user_id) select 'post',x,$2 from unnest($1::uuid[]) x",[ids,account.id])}finally{await db.end()}
  await setup(page,account.email,cat);await page.getByLabel('이미지 포함 (작성 당시 모습 포함)',{exact:true}).uncheck();await page.getByLabel('시작일 (서울)',{exact:true}).fill('2026-01-01');await page.getByLabel('종료일 (서울, 당일 포함)',{exact:true}).fill('2026-01-01');await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('heading',{name:'전체 1005개 · 6개 파일',exact:true})).toBeVisible()
  const all:string[]=[];for(let i=0;i<6;i++){await expect(page.getByRole('button',{name:'JSON 다운로드',exact:true})).toBeEnabled();const file=await download(page,'JSON 다운로드'),json=JSON.parse(file.bytes.toString());expect(json.part_number).toBe(i+1);expect(json.part_count).toBe(6);expect(json.post_count).toBe(i===5?5:200);all.push(...json.posts.map((p:{id:string})=>p.id));if(i<5)await page.getByRole('button',{name:'다음 파일 준비',exact:true}).click()}
  expect(all).toEqual(ids.sort());expect(new Set(all).size).toBe(1005);await expect(page.getByText(/마지막 분할까지 1005개의 글을 모두 전달/)).toBeVisible()
})
test('cancelled collection and failed responses leave no file and can be retried',async({page})=>{
  const account=await member(),cat=await category();await apiPost(account,'취소와 재시도',cat);await setup(page,account.email,cat)
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});let requested=()=>{};const request=new Promise<void>(resolve=>{requested=resolve});await page.route('**/rest/v1/rpc/export_manifest',async route=>{requested();await gate;await route.abort().catch(()=>{})},{times:1})
  await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await request;await page.getByRole('button',{name:'내보내기 취소',exact:true}).click();release();await expect(page.getByRole('status')).toContainText('취소했습니다');await expect(page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true})).toHaveCount(0)
  await page.route('**/rest/v1/rpc/export_batch',async route=>{await route.abort()},{times:1});await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('alert')).toContainText('완료하지 못했습니다');await page.getByRole('button',{name:'이 파일 다시 준비',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true})).toBeEnabled()
})
test('hidden-after-prepare content cannot be downloaded and logout releases export image URLs',async({page})=>{
  const account=await member(),operator=await member(true),cat=await category(),asset=await upload(account),id=await apiPost(account,'사후 숨김 글',cat,[asset])
  await page.addInitScript(()=>{const original=URL.revokeObjectURL;(window as unknown as {revoked:string[]}).revoked=[];URL.revokeObjectURL=url=>{(window as unknown as {revoked:string[]}).revoked.push(url);original(url)}})
  await setup(page,account.email,cat);await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true})).toBeEnabled();expect((await operator.client.rpc('moderate_content',{kind:'post',target_id:id,expected_version:1,new_status:'moderator_hidden',reason:'접근 검증'})).error).toBeNull()
  let downloads=0;page.on('download',()=>downloads++);await page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true}).click();await expect(page.getByRole('alert')).toContainText('공개 상태가 변경');expect(downloads).toBe(0);expect(await page.evaluate(()=>(window as unknown as {revoked:string[]}).revoked.length)).toBeGreaterThan(0)
  await page.getByRole('button',{name:'처음부터 다시 선택',exact:true}).click();await apiPost(account,'다음 준비 글',cat,[asset]);await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('button',{name:'이미지 ZIP 다운로드',exact:true})).toBeEnabled();const before=await page.evaluate(()=>(window as unknown as {revoked:string[]}).revoked.length)
  await page.getByRole('link',{name:'계정 설정',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {revoked:string[]}).revoked.length)).toBeGreaterThan(before);await page.goto('./#/exports');await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible()
})
test('Korean PDF waits for images and fonts, prints long text and replies, and guards direct print',async({page},info)=>{
  test.setTimeout(120000);const account=await member(),cat=await category(),asset=await upload(account),avatar=await upload(account,'profile');expect((await account.client.rpc('update_character',{target_id:account.char,expected_version:1,character_name:'한글 기록자',character_bio:'',avatar_id:avatar})).error).toBeNull()
  const long=Array.from({length:58},(_,i)=>`${i+1}번째 문단: 한글과 긴 문장도 다음 페이지에 자연스럽게 이어집니다. 우리 모임의 소중한 기록입니다.`).join('\n'),id=await apiPost(account,'한글 PDF 검증',cat,[asset],long),parent=(await account.client.rpc('create_comment',{request_id:randomUUID(),target_post:id,character_id:account.char,comment_body:'부모 댓글을 함께 보관합니다.'})).data!
  expect((await account.client.rpc('create_comment',{request_id:randomUUID(),target_post:id,character_id:account.char,comment_body:'마지막 답글도 빠짐없이 남습니다.',parent_comment:parent})).error).toBeNull();await apiPost(account,'마지막 게시글',cat,[],'마지막 파일과 마지막 페이지의 한글 확인')
  await setup(page,account.email,cat,'pdf');await page.getByRole('button',{name:'내보내기 준비',exact:true}).click();await expect(page.getByRole('button',{name:'PDF 인쇄 / 저장',exact:true})).toBeEnabled({timeout:30000});await expect(page.getByLabel('인쇄 미리보기')).toContainText('마지막 답글도 빠짐없이 남습니다.');expect(await page.getByLabel('인쇄 미리보기').locator('img').count()).toBe(5);expect(await page.getByLabel('인쇄 미리보기').locator('img').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0))).toBe(true);expect(await page.evaluate(()=>document.fonts.check('14px "Noto Sans KR"','한글'))).toBe(true)
  await page.emulateMedia({media:'print'});await expect(page.locator('.print-sheet')).toBeHidden();await expect(page.locator('.print-guard')).toBeVisible();await page.emulateMedia({media:'screen'})
  let pdf:Buffer|undefined;await page.exposeFunction('captureExportPdf',async()=>{await page.emulateMedia({media:'print'});await expect(page.locator('.export-controls')).toBeHidden();await expect(page.locator('.print-sheet')).toBeVisible();pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});await page.emulateMedia({media:'screen'})});await page.evaluate(()=>{window.print=()=>{return (window as unknown as {captureExportPdf:()=>Promise<void>}).captureExportPdf()}});await page.getByRole('button',{name:'PDF 인쇄 / 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('인쇄 창을 열었습니다');expect(pdf?.subarray(0,5).toString()).toBe('%PDF-');expect(pdf!.length).toBeGreaterThan(10000)
  if(process.env.EXPORT_PDF_QA)await writeFile(join(tmpdir(),`mini-commu-stage7-${info.project.name}.pdf`),pdf!)
  expect(await page.evaluate(()=>document.documentElement.dataset.exportPrint)).toBeUndefined();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
