import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { publicEnv } from '../../lib/env'

type Status = 'unconfigured' | 'loading' | 'signedOut' | 'uninvited' | 'active' | 'suspended' | 'error'
type AuthState = { status: Status; user: User | null; role: string | null; recovery: boolean }
let state: AuthState = { status: supabase ? 'loading' : 'unconfigured', user: null, role: null, recovery: false }
const listeners = new Set<() => void>()
let generation = 0
let started = false
let accountId: string | null = null
const pendingKey = 'mini-commu:pending-invite'
const recoveryKey = 'mini-commu:recovery'

function publish(next: AuthState) { state = next; listeners.forEach(listener => listener()) }
export function useAuth() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => state)
}
function readStorage(key: string) { try { return sessionStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value?: string) {
  try { if (value === undefined) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value) } catch { /* Manual re-entry remains available. */ }
}
export function rememberInvite(email: string, code: string) {
  writeStorage(pendingKey, JSON.stringify({ email: email.trim().toLowerCase(), code, expires: Date.now() + 86400000 }))
}
export function pendingInvite(email: string) {
  try {
    const saved = JSON.parse(readStorage(pendingKey) || 'null')
    if (saved?.email === email.toLowerCase() && saved.expires > Date.now()) return String(saved.code)
  } catch { /* Ignore malformed browser storage. */ }
  return ''
}
export function forgetInvite() { writeStorage(pendingKey) }
function clearAccountData() {
  // All feature caches/drafts must use this namespace. Auth SDK storage is separate.
  try {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of Object.keys(storage)) if (key.startsWith('mini-commu:')) storage.removeItem(key)
    }
  } catch { /* Restricted storage must not prevent sign-out. */ }
}
export async function refreshAuth() {
  if (!supabase) return
  const version = ++generation
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (version !== generation) return
    if (sessionError) throw sessionError
    if (!session) {
      if (accountId) clearAccountData()
      accountId = null
      publish({ status: 'signedOut', user: null, role: null, recovery: false }); return
    }
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw error
    const membership = await supabase.rpc('current_membership')
    if (membership.error) throw membership.error
    if (version !== generation) return
    if (accountId && accountId !== user.id) clearAccountData()
    accountId = user.id
    const member = membership.data?.[0]
    const status = member?.status === 'suspended' ? 'suspended' : member?.status === 'active' ? 'active' : 'uninvited'
    if (status === 'suspended') {
      const recovery = readStorage(recoveryKey) === user.id
      clearAccountData()
      if (recovery) writeStorage(recoveryKey, user.id)
    }
    publish({ status, user, role: member?.role ?? null, recovery: readStorage(recoveryKey) === user.id })
  } catch {
    if (version === generation) publish({ ...state, status: 'error', role: null })
  }
}
export function startAuth() {
  if (started || !supabase) return
  started = true
  supabase.auth.onAuthStateChange((event, session) => {
    // Do not call Auth asynchronously inside this SDK callback: its lock is held.
    ++generation
    if (event === 'SIGNED_OUT' || (accountId && accountId !== session?.user.id)) {
      clearAccountData()
      accountId = null
      publish({ status: session ? 'loading' : 'signedOut', user: null, role: null, recovery: false })
    } else if (session?.user.id !== state.user?.id) {
      publish({ status: 'loading', user: null, role: null, recovery: false })
    }
    if (event === 'PASSWORD_RECOVERY' && session) writeStorage(recoveryKey, session.user.id)
    setTimeout(() => { void refreshAuth() }, 0)
  })
  void refreshAuth()
  window.addEventListener('focus', () => { void refreshAuth() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshAuth() })
  // Server RLS enforces suspension immediately; mounted screens follow within 15s.
  window.setInterval(() => { if (!document.hidden) void refreshAuth() }, 15000)
}
export async function signOut(scope: 'local' | 'global' = 'local') {
  if (!supabase) return
  const { error } = await supabase.auth.signOut({ scope })
  if (error) throw error
  ++generation
  clearAccountData(); accountId = null
  publish({ status: 'signedOut', user: null, role: null, recovery: false })
}
export function finishRecovery() {
  writeStorage(recoveryKey)
  publish({ ...state, recovery: false })
}
export const siteUrl = publicEnv.ready ? publicEnv.values.siteUrl : ''

// Capture credentials once before HashRouter renders; immediately remove them
// from the address/history. No analytics, logs or third-party resources receive them.
function captureCallback() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const fragment = url.hash.slice(1)
  const error = url.searchParams.has('error') || new URLSearchParams(fragment).has('error')
  if (!code && !error && !fragment.startsWith('/auth/callback')) return null
  window.history.replaceState(null, '', `${url.pathname}#/auth/callback`)
  return code
}
const callback = captureCallback()
export const callbackType = callback ? 'pkce' : undefined
let verification: Promise<'signup' | 'recovery'> | undefined
export function verifyCallback() {
  if (!verification) verification = (async () => {
    if (!supabase || !callback) throw new Error('INVALID_CALLBACK')
    const result = await supabase.auth.exchangeCodeForSession(callback)
    if (result.error || !result.data.user) throw result.error ?? new Error('INVALID_CALLBACK')
    const type = readStorage(recoveryKey) === result.data.user.id ? 'recovery' : 'signup'
    if (type === 'recovery') writeStorage(recoveryKey, result.data.user.id)
    await refreshAuth()
    return type
  })().catch(error => { verification = undefined; throw error })
  return verification
}
export function authError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    flow_state_not_found: '인증을 요청한 브라우저에서 링크를 열어 주세요. 이메일 인증을 마쳤다면 로그인으로 가입을 이어갈 수 있습니다.',
    flow_state_expired: '인증 링크가 만료되었습니다. 인증 메일을 다시 요청해 주세요.',
    bad_code_verifier: '인증을 요청한 브라우저에서 링크를 열거나 인증 메일을 다시 요청해 주세요.',
    pkce_code_verifier_not_found: '인증을 요청한 브라우저에서 링크를 열어 주세요. 이메일 인증을 마쳤다면 로그인해 주세요.',
    invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
    email_not_confirmed: '이메일 인증을 먼저 완료해 주세요. 가입 화면에서 인증 메일을 다시 받을 수 있습니다.',
    over_request_rate_limit: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    over_email_send_rate_limit: '메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    weak_password: '비밀번호는 8자 이상으로 설정해 주세요.',
    same_password: '기존 비밀번호와 다른 비밀번호를 입력해 주세요.',
    otp_expired: '인증 링크가 만료되었거나 이미 사용되었습니다. 메일을 다시 요청해 주세요.',
  }
  return messages[code] ?? '요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
}
