import { test, expect, type Page } from '@playwright/test'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { localConfig, connect } from '../../scripts/local-db.mjs'

const env = localConfig()
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const emails: string[] = []
const invitations: string[] = []
const password = `Test-${randomUUID()}!`
function email() { const value = `e2e-${randomUUID()}@example.test`; emails.push(value); return value }
async function invite() {
  const db = await connect(env)
  try {
    const code = randomBytes(32).toString('hex')
    const result = await db.query("insert into private.invite_codes(code_hash,expires_at) values(encode(extensions.digest($1,'sha256'),'hex'),now()+interval '7 days') returning id", [code])
    invitations.push(result.rows[0].id)
    return code
  } finally { await db.end() }
}
async function mailLink(address: string, subject: string) {
  let link = ''
  await expect.poll(async () => {
    const response = await fetch(`${env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
    const data = await response.json()
    const message = data.messages?.find((item: { Subject: string }) => item.Subject.toLowerCase().includes(subject))
    if (!message) return false
    const body = await (await fetch(`${env.MAILPIT_URL}/api/v1/message/${message.ID}`)).json()
    link = body.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&') ?? ''
    return Boolean(link)
  }, { timeout: 20000 }).toBe(true)
  // Never follow mail links to an external service in a local test.
  expect(['127.0.0.1', 'localhost']).toContain(new URL(link).hostname)
  return link
}
async function signup(page: Page, address: string, code: string) {
  await page.goto('./#/signup')
  await page.getByLabel('이메일', { exact: true }).fill(address)
  await page.getByLabel('비밀번호', { exact: true }).fill(password)
  await page.getByLabel('초대 코드', { exact: true }).fill(code)
  await page.getByRole('button', { name: '인증 메일 받기', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('인증 메일을 확인')
}
async function confirm(page: Page, address: string, subject = 'confirm') {
  const link = await mailLink(address, subject)
  await page.goto(link)
  await expect(page).toHaveURL(/\/mini-commu\/#\/auth\/callback$/)
  await page.getByRole('button', { name: '이메일 확인 완료', exact: true }).click()
}
async function login(page: Page, address: string, secret = password) {
  await page.goto('./#/login')
  await page.getByLabel('이메일', { exact: true }).fill(address)
  await page.getByLabel('비밀번호', { exact: true }).fill(secret)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
}
async function createMember() {
  const address = email()
  const result = await admin.auth.admin.createUser({ email: address, password, email_confirm: true })
  expect(result.error).toBeNull()
  const db = await connect(env)
  try { await db.query('insert into private.members(user_id) values($1)', [result.data.user!.id]) } finally { await db.end() }
  return { address, id: result.data.user!.id }
}

test.afterAll(async () => {
  const db = await connect(env)
  let ids: string[]
  try {
    ids = (await db.query('select id from auth.users where email=any($1::text[])', [emails])).rows.map((row: { id: string }) => row.id)
    await db.query('begin')
    await db.query('delete from private.invite_redemptions where user_id=any($1::uuid[])', [ids])
    await db.query('delete from private.invite_codes where id=any($1::uuid[])', [invitations])
    await db.query('delete from private.members where user_id=any($1::uuid[])', [ids])
    await db.query('commit')
  } catch (error) { await db.query('rollback'); throw error } finally { await db.end() }
  for (const id of ids) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()
})

test('real email confirmation, invite redemption, refresh, second device and logout', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const address = email(), code = await invite()
  await signup(page, address, code)
  await page.goto('./#/feed')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  await confirm(page, address)
  await expect(page.getByRole('heading', { name: '초대 확인하고 가입 완료' })).toBeVisible()
  await expect(page.getByLabel('초대 코드')).toHaveValue(code)
  await page.getByRole('button', { name: '가입 완료', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 캐릭터', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '내 캐릭터', exact: true })).toBeVisible()
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5173/mini-commu/' })
  try {
    const second = await other.newPage()
    await login(second, address)
    await expect(second.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
    await second.goto('./#/admin')
    await expect(second.getByRole('heading', { name: '운영자만 이용할 수 있어요' })).toBeVisible()
  } finally { await other.close() }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => { localStorage.setItem('mini-commu:draft', 'private draft'); sessionStorage.setItem('mini-commu:image-url', 'private image') })
  await page.goto('./#/settings')
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mini-commu:draft'))).toBeNull()
  expect(await page.evaluate(() => sessionStorage.getItem('mini-commu:image-url'))).toBeNull()
  await page.goto('./#/characters')
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('uninvited user remains blocked, invalid invite is recoverable and code is never in the URL', async ({ page }) => {
  const address = email(), code = await invite()
  await signup(page, address, code)
  await confirm(page, address)
  await expect(page.getByRole('heading', { name: '초대 확인하고 가입 완료' })).toBeVisible()
  await page.getByLabel('초대 코드').fill('0'.repeat(64))
  await page.getByRole('button', { name: '가입 완료', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('사용할 수 없는 초대 코드')
  await page.goto('./#/feed')
  await expect(page.getByRole('heading', { name: '초대 확인하고 가입 완료' })).toBeVisible()
  expect(page.url()).not.toContain(code)
  await page.getByLabel('초대 코드').fill(code)
  await page.getByRole('button', { name: '가입 완료', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 캐릭터', exact: true })).toBeVisible()
})

test('real recovery mail changes password; expired link and invalid credentials are handled', async ({ page }) => {
  const member = await createMember()
  await page.goto('./#/reset-password')
  await page.getByLabel('이메일', { exact: true }).fill(member.address)
  await page.getByRole('button', { name: '재설정 메일 받기' }).click()
  await expect(page.getByRole('status')).toContainText('등록된 이메일이라면')
  const link = await mailLink(member.address, 'reset')
  await page.goto(link)
  await page.getByRole('button', { name: '이메일 확인 완료' }).click()
  await expect(page.getByRole('heading', { name: '새 비밀번호 설정' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '새 비밀번호 설정' })).toBeVisible()
  const newPassword = `${password}-new`
  await page.getByLabel('새 비밀번호', { exact: true }).fill(newPassword)
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('mismatch-password')
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('일치하지 않습니다')
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('비밀번호를 변경했습니다')
  await login(page, member.address)
  await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호')
  await page.getByLabel('비밀번호', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
  await page.goto(link)
  await expect(page.getByText('유효한 인증 정보가 없습니다.', { exact: false })).toBeVisible()
})

test('suspension with an existing session blocks screens and clears account caches', async ({ page }) => {
  const member = await createMember()
  await login(page, member.address)
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('mini-commu:draft', 'private draft'))
  const db = await connect(env)
  try { await db.query("update private.members set status='suspended' where user_id=$1", [member.id]) } finally { await db.end() }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '이용이 정지된 계정입니다' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mini-commu:draft'))).toBeNull()
  await page.goto('./#/signup')
  await expect(page.getByRole('heading', { name: '이용이 정지된 계정입니다' })).toBeVisible()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
  await expect(page.getByRole('heading', { name: '초대 코드로 가입', exact: true })).toBeVisible()
})

test('resend mail and confirmation in a different browser can resume by password login', async ({ page, browser }) => {
  const address = email(), code = await invite()
  await signup(page, address, code)
  const firstLink = await mailLink(address, 'confirm')
  // Supabase deliberately requires one second between local email sends.
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: '인증 메일 다시 받기', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('인증이 필요한 계정이라면')
  let link = ''
  await expect.poll(async () => { link = await mailLink(address, 'confirm'); return link !== firstLink }).toBe(true)
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5173/mini-commu/' })
  try {
    const second = await other.newPage()
    await second.goto(link)
    await second.getByRole('button', { name: '이메일 확인 완료' }).click()
    await expect(second.getByRole('alert')).toContainText('인증을 요청한 브라우저')
    await login(second, address)
    await expect(second.getByRole('heading', { name: '초대 확인하고 가입 완료' })).toBeVisible()
    await second.getByLabel('초대 코드').fill(code)
    await second.getByRole('button', { name: '가입 완료', exact: true }).click()
    await expect(second.getByRole('heading', { name: '내 캐릭터', exact: true })).toBeVisible()
  } finally { await other.close() }
})

test('membership network failures fail closed and can be retried', async ({ page }) => {
  const member = await createMember()
  await login(page, member.address)
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
  await page.route('**/rest/v1/rpc/current_membership', route => route.abort())
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: '연결을 확인해 주세요' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeHidden()
  await page.unroute('**/rest/v1/rpc/current_membership')
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
})

test('expired sessions refresh and revoked refresh tokens return to login without account caches', async ({ page }) => {
  const member = await createMember()
  await login(page, member.address)
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
  // Force the SDK expiry timestamp; the actual refresh still goes to local Auth.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))!
    const session = JSON.parse(localStorage.getItem(key)!)
    session.expires_at = 1
    localStorage.setItem(key, JSON.stringify(session))
  })
  const refreshed = page.waitForResponse(response => response.url().includes('/auth/v1/token?grant_type=refresh_token'))
  await page.reload()
  expect((await refreshed).ok()).toBe(true)
  await expect(page.getByRole('heading', { name: '모임 피드', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))!
    const session = JSON.parse(localStorage.getItem(key)!)
    session.expires_at = 1
    session.refresh_token = 'revoked-local-test-token'
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('mini-commu:draft', 'old account draft')
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mini-commu:draft'))).toBeNull()
})
