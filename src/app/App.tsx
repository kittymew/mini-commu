import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { appConfig } from '../lib/config'
import { publicEnv } from '../lib/env'
import { CallbackPage, LoginPage, MemberGate, ResetPasswordPage, SettingsPage, SignupPage } from '../features/auth/AuthPages'
import { CharacterProvider } from '../features/characters/CharacterProvider'
import { useAuth } from '../features/auth/auth'

const CharactersPage = lazy(() => import('../features/characters/CharactersPage').then(module => ({ default: module.CharactersPage })))
const FeedPage = lazy(() => import('../features/posts/FeedPage'))
const PostEditor = lazy(() => import('../features/posts/PostEditor'))
const PostPage = lazy(() => import('../features/posts/PostPage'))
const CategoriesPage = lazy(() => import('../features/posts/CategoriesPage'))

const ActivityPage = lazy(() => import('../features/posts/ActivityPage'))
const AdminPage = lazy(() => import('../features/admin/AdminPage'))

const ExportsPage = lazy(() => import('../features/exports/ExportsPage'))

function Home() {
  return <>
    <section className="hero card">
      <div className="eyebrow">우리만의 작은 커뮤니티</div>
      <h1>다양한 캐릭터로,<br />함께 쌓아가는 이야기.</h1>
      <p>초대받은 사람들과 편안하게 나누는 공간.<br />캐릭터의 모습과 그때의 이야기를 소중히 남겨요.</p>
      <div className="actions"><Link className="button" to="/login">로그인 화면</Link><Link className="button secondary" to="/signup">가입 화면</Link></div>
      <div className="hero-note">초대 코드와 이메일 인증으로 가입할 수 있습니다.</div>
    </section>
    <section className="feature-grid" aria-label="모임에서 함께할 일">
      <article className="card"><span className="feature-number">01</span><h2>나의 여러 모습</h2><p>계정 하나에 최대 {appConfig.limits.charactersPerAccount}개의 캐릭터. 이야기마다 어울리는 모습으로 함께해요.</p><Link to="/characters">캐릭터 화면 둘러보기 →</Link></article>
      <article className="card"><span className="feature-number">02</span><h2>차곡차곡 쌓인 일상</h2><p>글과 사진, 댓글과 투표로 함께한 순간을 모아 가요.</p><Link to="/feed">피드 화면 둘러보기 →</Link></article>
      <article className="card"><span className="feature-number">03</span><h2>오래 간직할 이야기</h2><p>작성 당시의 이름과 모습을 남기고, 소중한 기록을 파일로 보관해요.</p><Link to="/exports">내보내기 화면 둘러보기 →</Link></article>
    </section>
    <aside className="setup card" aria-labelledby="setup-title">
      <h2 id="setup-title">개발 환경 안내</h2>
      {publicEnv.ready ? <p>가입과 로그인을 이용할 수 있습니다.</p> : <><p>서버 연결 전입니다. 환경변수 없이도 기본 화면을 확인할 수 있습니다.</p><ul>{publicEnv.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="muted">설정 방법은 README와 .env.example을 참고해 주세요.</p></>}
    </aside>
  </>
}

export function App() {
  const auth = useAuth()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => { mainRef.current?.focus(); window.scrollTo(0, 0) }, [pathname])
  return <CharacterProvider>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); mainRef.current?.focus() }}>본문으로 건너뛰기</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="작은 모임 시작 화면"><span className="brand-mark" aria-hidden="true">m.</span>{appConfig.name}</Link>
      <nav aria-label="주 메뉴"><NavLink to="/feed">피드</NavLink><NavLink to="/characters">캐릭터</NavLink>{auth.status==='active'&&<><NavLink to="/activity">내 활동</NavLink><NavLink to="/exports">내보내기</NavLink></>}{auth.role==='admin'&&<NavLink to="/admin">운영</NavLink>}{auth.user ? <NavLink to="/settings">계정 설정</NavLink> : <NavLink to="/login">로그인</NavLink>}</nav>
    </div></header>
    <main id="main" ref={mainRef} tabIndex={-1} className="page-container">
      <Suspense fallback={<p role="status">화면을 불러오고 있어요…</p>}><Routes><Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} /><Route path="/signup" element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/feed" element={<MemberGate><FeedPage /></MemberGate>} />
        <Route path="/posts/new" element={<MemberGate><PostEditor /></MemberGate>} />
        <Route path="/posts/:postId" element={<MemberGate><PostPage /></MemberGate>} />
        <Route path="/posts/:postId/edit" element={<MemberGate><PostEditor /></MemberGate>} />
        <Route path="/activity" element={<MemberGate><ActivityPage /></MemberGate>} /><Route path="/admin" element={<MemberGate admin><div className="admin-page"><AdminPage /></div></MemberGate>} />
        <Route path="/categories" element={<MemberGate admin><CategoriesPage /></MemberGate>} />
        <Route path="/characters" element={<MemberGate><CharactersPage /></MemberGate>} />
        <Route path="/settings" element={<MemberGate><SettingsPage /></MemberGate>} />
        <Route path="/exports" element={<MemberGate><ExportsPage /></MemberGate>} />
        <Route path="*" element={<section className="card placeholder"><span className="eyebrow">404</span><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 시작 화면으로 돌아가 주세요.</p><Link className="button" to="/">시작 화면으로</Link></section>} />
      </Routes></Suspense>
    </main>
    <footer className="site-footer"><span>작은 모임 · mini-commu</span><span>서비스 준비 중</span></footer>
  </CharacterProvider>
}
