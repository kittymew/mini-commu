import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { authError, callbackType, finishRecovery, forgetInvite, pendingInvite, refreshAuth, rememberInvite, signOut, siteUrl, useAuth, verifyCallback } from './auth'

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card auth-panel"><span className="eyebrow">작은 모임</span><h1>{title}</h1>{children}</section>
}
function Notice({ error, message }: { error: string; message?: string }) {
  return <>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-notice" role="status">{message}</p>}</>
}
function Unavailable() {
  return <><p>아직 서버에 연결되지 않았습니다. 연결 설정 후 이용할 수 있어요.</p><Link to="/">시작 화면으로</Link></>
}
function LogoutButton() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <><button className="button secondary" disabled={busy} onClick={async () => {
    setBusy(true); setError('')
    try { await signOut() } catch (e) { setError(authError(e)) } finally { setBusy(false) }
  }}>로그아웃</button><Notice error={error} /></>
}
export function MemberGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const auth = useAuth()
  if (auth.status === 'unconfigured') return <Panel title="서버 연결 준비 중"><Unavailable /></Panel>
  if (auth.status === 'loading') return <Panel title="로그인 확인 중"><p role="status">잠시만 기다려 주세요.</p></Panel>
  if (auth.status === 'error') return <Panel title="연결을 확인해 주세요"><p>회원 상태를 확인하지 못했습니다.</p><button className="button" onClick={() => void refreshAuth()}>다시 시도</button><LogoutButton /></Panel>
  if (auth.status === 'signedOut') return <Navigate to="/login" replace />
  if (auth.recovery) return <Navigate to="/reset-password" replace />
  if (auth.status === 'suspended') return <Panel title="이용이 정지된 계정입니다"><p>모임 운영자에게 문의해 주세요.</p><LogoutButton /></Panel>
  if (auth.status === 'uninvited') return <Navigate to="/signup" replace />
  if (admin && auth.role !== 'admin') return <Panel title="운영자만 이용할 수 있어요"><Link to="/feed">피드로 돌아가기</Link></Panel>
  return <div key={auth.user?.id}>{children}</div>
}
export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (auth.status === 'active') return <Navigate to={auth.recovery ? '/reset-password' : '/feed'} replace />
  if (auth.status === 'uninvited') return <Navigate to="/signup" replace />
  if (auth.status === 'suspended') return <MemberGate><></></MemberGate>
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const result = await supabase.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) })
      if (result.error) throw result.error
      await refreshAuth(); navigate('/feed', { replace: true })
    } catch (e) { setError(authError(e)) } finally { setBusy(false) }
  }
  return <Panel title="로그인">{!supabase ? <Unavailable /> : <>
    <p>이메일과 비밀번호로 모임에 들어오세요.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><label>이메일<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label><button className="button" type="submit">{busy ? '로그인 중…' : '로그인'}</button></fieldset></form>
    <Notice error={error} /><div className="auth-links"><Link to="/signup">초대 코드로 가입</Link><Link to="/reset-password">비밀번호 재설정</Link></div>
  </>}</Panel>
}
export function SignupPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  if (auth.status === 'active') return <Navigate to="/characters" replace />
  if (auth.status === 'suspended') return <MemberGate><></></MemberGate>
  const loggedIn = auth.status === 'uninvited'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const code = String(data.get('invite')).trim()
    setBusy(true); setError(''); setMessage('')
    try {
      if (loggedIn) {
        const result = await supabase.rpc('redeem_invite', { invite_code: code })
        if (result.error) throw result.error
        if (!['JOINED', 'ALREADY_MEMBER'].includes(result.data)) {
          const errors: Record<string, string> = { INVALID_INVITE: '사용할 수 없는 초대 코드입니다. 코드와 만료 여부를 확인해 주세요.', RATE_LIMITED: '초대 코드 확인 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.', EMAIL_REQUIRED: '이메일 인증을 먼저 완료해 주세요.', SUSPENDED: '이용이 정지된 계정입니다.', AUTH_REQUIRED: '다시 로그인해 주세요.' }
          setError(errors[result.data] ?? '가입을 완료하지 못했습니다. 다시 시도해 주세요.'); return
        }
        forgetInvite(); await refreshAuth(); navigate('/characters', { replace: true })
      } else {
        rememberInvite(email, code)
        const result = await supabase.auth.signUp({ email: email.trim(), password: String(data.get('password')), options: { emailRedirectTo: siteUrl } })
        if (result.error) throw result.error
        form.reset()
        setMessage('인증 메일을 확인해 주세요. 이미 가입한 이메일이라면 로그인하거나 비밀번호를 재설정해 주세요.')
      }
    } catch (e) { setError(authError(e)) } finally { setBusy(false) }
  }
  async function resend() {
    if (!supabase || !email.trim()) { setError('인증 메일을 받을 이메일을 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const result = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: siteUrl } })
      if (result.error) throw result.error
      setMessage('인증이 필요한 계정이라면 메일이 발송됩니다. 메일함을 확인해 주세요.')
    } catch (e) { setError(authError(e)) } finally { setBusy(false) }
  }
  return <Panel title={loggedIn ? '초대 확인하고 가입 완료' : '초대 코드로 가입'}>{!supabase ? <Unavailable /> : <>
    <p>{loggedIn ? `${auth.user?.email} 이메일 인증이 완료되었습니다. 초대 코드를 확인하면 모임에 참여할 수 있어요.` : '초대 코드와 이메일 인증으로 함께해요. 비밀번호는 8자 이상으로 입력해 주세요.'}</p>
    <form key={auth.user?.id ?? 'signup'} onSubmit={submit}><fieldset disabled={busy || auth.status === 'loading'}>
      {!loggedIn && <><label>이메일<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><label>비밀번호<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label></>}
      <label>초대 코드<input name="invite" autoComplete="off" spellCheck={false} required minLength={64} maxLength={64} pattern="[0-9a-f]{64}" defaultValue={loggedIn ? pendingInvite(auth.user?.email ?? '') : ''} aria-describedby="invite-help" /></label>
      <p id="invite-help" className="muted">초대받은 64자리 코드를 입력해 주세요. 다른 브라우저에서 인증했다면 코드를 다시 입력해 주세요.</p>
      <button className="button" type="submit">{busy ? '처리 중…' : loggedIn ? '가입 완료' : '인증 메일 받기'}</button>
    </fieldset></form><Notice error={error} message={message} />
    {loggedIn ? <LogoutButton /> : <div className="auth-links"><button type="button" disabled={busy} onClick={() => void resend()}>인증 메일 다시 받기</button><Link to="/login">이미 계정이 있나요? 로그인</Link></div>}
  </>}</Panel>
}
export function CallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <Panel title="이메일 인증">{!supabase ? <Unavailable /> : <>
    <p>{callbackType ? '아래 버튼을 눌러 이메일 확인을 완료해 주세요.' : '유효한 인증 정보가 없습니다. 메일의 링크를 다시 열거나 새 메일을 요청해 주세요.'}</p>
    {callbackType && <button className="button" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try { const type = await verifyCallback(); navigate(type === 'recovery' ? '/reset-password' : '/signup', { replace: true }) }
      catch (e) { setError(authError(e)) } finally { setBusy(false) }
    }}>{busy ? '인증 중…' : '이메일 확인 완료'}</button>}
    <Notice error={error} /><div className="auth-links"><Link to="/login">로그인</Link><Link to="/signup">가입 및 인증 메일 요청</Link><Link to="/reset-password">비밀번호 재설정 요청</Link></div>
  </>}</Panel>
}
export function ResetPasswordPage() {
  const auth = useAuth()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const changing = auth.recovery && Boolean(auth.user)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError(''); setMessage('')
    try {
      if (changing) {
        if (data.get('password') !== data.get('confirm')) { setError('두 비밀번호가 일치하지 않습니다.'); return }
        const result = await supabase.auth.updateUser({ password: String(data.get('password')) })
        if (result.error) throw result.error
        finishRecovery()
        await signOut('global')
        setMessage('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.')
      } else {
        const result = await supabase.auth.resetPasswordForEmail(String(data.get('email')).trim(), { redirectTo: siteUrl })
        if (result.error) throw result.error
        setMessage('등록된 이메일이라면 재설정 메일이 발송됩니다. 메일함을 확인해 주세요.')
      }
      form.reset()
    } catch (e) { setError(authError(e)) } finally { setBusy(false) }
  }
  return <Panel title={changing ? '새 비밀번호 설정' : '비밀번호 재설정'}>{!supabase ? <Unavailable /> : <>
    <p>{changing ? '새 비밀번호를 8자 이상으로 입력해 주세요.' : '가입한 이메일로 비밀번호 재설정 링크를 보내드립니다. 요청한 브라우저에서 메일의 링크를 열어 주세요.'}</p>
    <form key={changing ? 'change' : 'request'} onSubmit={submit}><fieldset disabled={busy}>
      {changing ? <><label>새 비밀번호<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label>새 비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label></> : <label>이메일<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
      <button className="button" type="submit">{busy ? '처리 중…' : changing ? '비밀번호 변경' : '재설정 메일 받기'}</button>
    </fieldset></form><Notice error={error} message={message} /><Link to="/login">로그인으로 돌아가기</Link>
  </>}</Panel>
}
export function SettingsPage() {
  const auth = useAuth()
  return <Panel title="계정 설정"><p>{auth.user?.email}</p><div className="auth-links"><Link to="/reset-password">비밀번호 재설정</Link><LogoutButton /></div></Panel>
}
