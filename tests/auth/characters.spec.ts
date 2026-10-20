import { test,expect,type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { ImageMagick,MagickColors,MagickFormat } from '@imagemagick/magick-wasm'
import { initializeImages } from '../../supabase/functions/profile-image/image.mjs'
import type { Database } from '../../src/types/database'
import { localConfig,connect } from '../../scripts/local-db.mjs'
const env=localConfig()
const admin=createClient<Database>(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users:string[]=[]
const password=`Character-${randomUUID()}!`
let png:Buffer
async function member(){
  const email=`e2e-characters-${randomUUID()}@example.test`
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull()
  const id=result.data.user!.id;users.push(id)
  const db=await connect(env);try{await db.query('insert into private.members(user_id) values($1)',[id])}finally{await db.end()}
  const client=createClient<Database>(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  expect((await client.auth.signInWithPassword({email,password})).error).toBeNull()
  return {email,id,client}
}
async function login(page:Page,email:string){
  await page.goto('./#/login');await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password)
  await page.getByRole('button',{name:'로그인',exact:true}).click()
  await expect(page.getByRole('heading',{name:'모임 피드',exact:true})).toBeVisible()
  await page.goto('./#/characters')
  await expect(page.getByRole('heading',{name:'내 캐릭터',exact:true})).toBeVisible()
}
async function createCharacter(page:Page,name:string,avatar=false){
  await page.getByRole('button',{name:'캐릭터 만들기',exact:true}).click()
  await page.getByLabel('캐릭터 이름',{exact:true}).fill(name)
  await page.getByLabel('소개',{exact:true}).fill('새로운 이야기\n함께해요')
  if(avatar)await page.getByLabel('프로필 이미지',{exact:true}).setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:png})
  await page.getByRole('button',{name:'저장',exact:true}).click()
  await expect(page.getByRole('status').filter({hasText:'캐릭터를 저장했습니다'})).toBeVisible()
}
test.beforeAll(async()=>{
  await initializeImages(await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))))
  png=Buffer.from(ImageMagick.read(MagickColors.Green,40,40,img=>img.write(MagickFormat.Png,b=>Uint8Array.from(b))))
})
test.afterAll(async()=>{
  const db=await connect(env)
  try{
    const assets=(await db.query('select a.id,a.storage_path,a.thumbnail_path from public.assets a join private.asset_owners o on o.asset_id=a.id where o.user_id=any($1::uuid[])',[users])).rows
    const paths=assets.flatMap(a=>[a.storage_path,a.thumbnail_path]).filter(Boolean)
    if(paths.length)expect((await admin.storage.from('community').remove(paths)).error).toBeNull()
    await db.query('begin')
    const chars=(await db.query('delete from private.character_owners where user_id=any($1::uuid[]) returning character_id',[users])).rows.map(r=>r.character_id)
    await db.query('delete from public.characters where id=any($1::uuid[])',[chars])
    await db.query('delete from private.asset_owners where user_id=any($1::uuid[])',[users])
    await db.query('delete from public.assets where id=any($1::uuid[])',[assets.map(a=>a.id)])
    await db.query('delete from private.members where user_id=any($1::uuid[])',[users]);await db.query('commit')
  }catch(e){await db.query('rollback');throw e}finally{await db.end()}
  for(const id of users)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()
})

test('real character CRUD, profile versions, device-local selection and another browser see the same characters',async({page,browser})=>{
  const account=await member();await login(page,account.email)
  await expect(page.getByRole('heading',{name:'첫 캐릭터를 만들어 보세요'})).toBeVisible()
  await createCharacter(page,'새봄',true)
  const first=(await account.client.rpc('list_my_characters')).data![0]
  await expect(page.getByRole('article',{name:'새봄 캐릭터'}).getByRole('img')).toBeVisible()
  await createCharacter(page,'달빛')
  await page.getByLabel('현재 캐릭터',{exact:true}).selectOption(first.id)
  await page.reload();await expect(page.getByLabel('현재 캐릭터',{exact:true})).toHaveValue(first.id)
  await page.goto('./#/posts/new');await expect(page.getByText('새봄의 이름과 프로필로 작성할 준비가 되었어요.')).toBeVisible()
  const other=await browser.newContext({baseURL:'http://127.0.0.1:5173/mini-commu/'})
  try{
    const second=await other.newPage();await login(second,account.email)
    await expect(second.getByRole('article')).toHaveCount(2)
    await expect(second.getByLabel('현재 캐릭터',{exact:true})).toHaveValue('')
  }finally{await other.close()}
  await page.goto('./#/characters')
  await page.getByRole('article',{name:'새봄 캐릭터'}).getByRole('button',{name:'수정',exact:true}).click()
  await page.getByLabel('캐릭터 이름',{exact:true}).fill('봄날')
  await page.getByLabel('프로필 이미지',{exact:true}).setInputFiles({name:'new.png',mimeType:'image/png',buffer:png})
  await page.getByRole('button',{name:'저장',exact:true}).click()
  await expect(page.getByRole('article',{name:'봄날 캐릭터'})).toBeVisible()
  const updated=(await account.client.rpc('list_my_characters')).data!.find(c=>c.id===first.id)!
  expect(updated.avatar_asset_id).not.toBe(first.avatar_asset_id)
  await page.getByRole('article',{name:'봄날 캐릭터'}).getByRole('button',{name:'삭제',exact:true}).click()
  await page.getByRole('button',{name:'삭제 취소',exact:true}).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.getByRole('article',{name:'봄날 캐릭터'}).getByRole('button',{name:'삭제',exact:true}).click()
  await page.getByRole('button',{name:'삭제 확정',exact:true}).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByLabel('현재 캐릭터',{exact:true})).toHaveValue('')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('six-character UI limit, disable, reactivation denial and deleting frees a slot',async({page})=>{
  const account=await member()
  for(let i=1;i<=6;i++)expect((await account.client.rpc('create_character',{character_name:`캐릭터${i}`})).error).toBeNull()
  await login(page,account.email)
  await expect(page.getByRole('article')).toHaveCount(6)
  await expect(page.getByRole('button',{name:'캐릭터 만들기',exact:true})).toBeDisabled()
  await page.getByRole('article',{name:'캐릭터1 캐릭터',exact:true}).getByRole('button',{name:'사용 중지',exact:true}).click()
  await expect(page.getByRole('button',{name:'캐릭터 만들기',exact:true})).toBeEnabled()
  await createCharacter(page,'일곱번째')
  await page.getByRole('article',{name:'캐릭터1 캐릭터',exact:true}).getByRole('button',{name:'다시 사용',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('최대 6개')
  await page.getByRole('article',{name:'일곱번째 캐릭터',exact:true}).getByRole('button',{name:'삭제',exact:true}).click()
  await page.getByRole('button',{name:'삭제 확정',exact:true}).click()
  await page.getByRole('article',{name:'캐릭터1 캐릭터',exact:true}).getByRole('button',{name:'다시 사용',exact:true}).click()
  await expect(page.getByText('사용 중 6 / 6',{exact:false})).toBeVisible()
})

test('conflicting changes preserve the form, and deletion elsewhere invalidates the selection',async({page})=>{
  const account=await member();await login(page,account.email);await createCharacter(page,'원래 이름')
  const c=(await account.client.rpc('list_my_characters')).data![0]
  await page.getByRole('button',{name:'수정',exact:true}).click()
  await page.getByLabel('소개',{exact:true}).fill('보존할 입력')
  expect((await account.client.rpc('update_character',{target_id:c.id,expected_version:c.version,character_name:'다른 창',character_bio:''})).error).toBeNull()
  await page.getByRole('button',{name:'저장',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('다른 곳에서 변경')
  await expect(page.getByLabel('소개',{exact:true})).toHaveValue('보존할 입력')
  await page.getByRole('button',{name:'취소',exact:true}).click()
  expect((await account.client.rpc('set_character_status',{target_id:c.id,expected_version:c.version+1,new_status:'deleted'})).error).toBeNull()
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading',{name:'첫 캐릭터를 만들어 보세요'})).toBeVisible()
  await expect(page.getByLabel('현재 캐릭터',{exact:true})).toHaveValue('')
})

test('failed profile upload preserves entered data; logout revokes actual image URLs and isolates another account',async({page})=>{
  const account=await member(),other=await member();await login(page,account.email)
  await page.getByRole('button',{name:'캐릭터 만들기',exact:true}).click()
  await page.getByLabel('캐릭터 이름',{exact:true}).fill('나의 모습')
  await page.getByLabel('프로필 이미지',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg/>')})
  await page.getByRole('button',{name:'저장',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('정상적인 JPEG')
  await expect(page.getByLabel('캐릭터 이름',{exact:true})).toHaveValue('나의 모습')
  await page.getByLabel('프로필 이미지',{exact:true}).setInputFiles({name:'good.png',mimeType:'image/png',buffer:png})
  await page.getByRole('button',{name:'저장',exact:true}).click()
  const avatar=page.getByRole('article').getByRole('img')
  await expect(avatar).toBeVisible()
  const imageUrl=await avatar.getAttribute('src')
  await page.goto('./#/settings');await page.getByRole('button',{name:'로그아웃',exact:true}).click()
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mini-commu:character:')))).toEqual([])
  expect(await page.evaluate(async url=>{try{await fetch(url!);return true}catch{return false}},imageUrl)).toBe(false)
  await login(page,other.email)
  await expect(page.getByRole('heading',{name:'첫 캐릭터를 만들어 보세요'})).toBeVisible()
  await expect(page.getByLabel('현재 캐릭터',{exact:true})).toHaveValue('')
})
