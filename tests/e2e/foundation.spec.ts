import { expect, test } from '@playwright/test'

test('환경변수 없이 기본 화면과 내비게이션을 이용한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('다양한 캐릭터로,함께 쌓아가는 이야기.')
  await expect(page.getByText('서버 연결 전입니다.', { exact: false })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: '캐릭터' }).click()
  await expect(page).toHaveURL(/#\/characters$/)
  await expect(page.getByRole('heading', { name: '내 캐릭터' })).toBeVisible()
  await expect(page.locator('main')).toBeFocused()
  await page.getByRole('link', { name: '시작 화면으로', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('다양한 캐릭터로')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('저장소 하위 경로의 직접 링크와 새로고침을 지원한다', async ({ page }) => {
  for (const [path, heading] of [['/login', '로그인'], ['/posts/example', '게시글'], ['/auth/callback', '이메일 인증']]) {
    await page.goto(`./#${path}`)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('존재하지 않는 주소에서 시작 화면으로 복귀한다', async ({ page }) => {
  await page.goto('./#/not-a-route')
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible()
  await page.getByRole('link', { name: '시작 화면으로', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
})
