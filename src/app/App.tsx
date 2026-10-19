import { useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { PlaceholderPage } from '../components/PlaceholderPage'
import { appConfig } from '../lib/config'
import { publicEnv } from '../lib/env'

const pages = [
  { path: '/login', title: '로그인', description: '이메일과 비밀번호로 내 계정에 로그인합니다.', step: '3단계' },
  { path: '/signup', title: '초대 코드로 가입', description: '초대 코드와 이메일 인증으로 모임에 참여합니다.', step: '3단계' },
  { path: '/reset-password', title: '비밀번호 재설정', description: '이메일을 통해 계정을 복구합니다.', step: '3단계' },
  { path: '/auth/callback', title: '이메일 인증', description: '이메일 인증 후 가입 절차를 이어갑니다.', step: '3단계' },
  { path: '/feed', title: '모임 피드', description: '캐릭터들의 이야기와 공지를 모아 봅니다.', step: '5단계' },
  { path: '/characters', title: '내 캐릭터', description: '캐릭터를 만들고 활동할 캐릭터를 선택합니다.', step: '4단계' },
  { path: '/posts/new', title: '글 작성', description: '선택한 캐릭터로 새로운 이야기를 작성합니다.', step: '5단계' },
  { path: '/posts/:postId', title: '게시글', description: '글과 이미지, 댓글을 확인합니다.', step: '5단계' },
  { path: '/posts/:postId/edit', title: '글 수정', description: '내가 작성한 글의 내용을 수정합니다.', step: '5단계' },
  { path: '/activity', title: '내 활동', description: '내 계정으로 작성한 글과 댓글을 모아 봅니다.', step: '6단계' },
  { path: '/exports', title: '내보내기', description: '열람 가능한 이야기를 파일로 보관합니다.', step: '7단계' },
  { path: '/settings', title: '계정 설정', description: '계정과 로그인 상태를 관리합니다.', step: '3단계' },
  { path: '/admin', title: '모임 운영', description: '초대와 카테고리, 회원 권한을 관리합니다.', step: '6단계' },
]

function Home() {
  return <>
    <section className="hero card">
      <div className="eyebrow">우리만의 작은 커뮤니티</div>
      <h1>다양한 캐릭터로,<br />함께 쌓아가는 이야기.</h1>
      <p>초대받은 사람들과 편안하게 나누는 공간.<br />캐릭터의 모습과 그때의 이야기를 소중히 남겨요.</p>
      <div className="actions"><Link className="button" to="/login">로그인 화면</Link><Link className="button secondary" to="/signup">가입 화면</Link></div>
      <div className="hero-note">현재 개발 준비 단계로, 가입과 로그인 기능은 아직 제공되지 않습니다.</div>
    </section>
    <section className="feature-grid" aria-label="모임에서 함께할 일">
      <article className="card"><span className="feature-number">01</span><h2>나의 여러 모습</h2><p>계정 하나에 최대 {appConfig.limits.charactersPerAccount}개의 캐릭터. 이야기마다 어울리는 모습으로 함께해요.</p><Link to="/characters">캐릭터 화면 둘러보기 →</Link></article>
      <article className="card"><span className="feature-number">02</span><h2>차곡차곡 쌓인 일상</h2><p>글과 사진, 댓글과 투표로 함께한 순간을 모아 가요.</p><Link to="/feed">피드 화면 둘러보기 →</Link></article>
      <article className="card"><span className="feature-number">03</span><h2>오래 간직할 이야기</h2><p>작성 당시의 이름과 모습을 남기고, 소중한 기록을 파일로 보관해요.</p><Link to="/exports">내보내기 화면 둘러보기 →</Link></article>
    </section>
    <aside className="setup card" aria-labelledby="setup-title">
      <h2 id="setup-title">개발 환경 안내</h2>
      {publicEnv.ready ? <p>환경변수가 입력되었습니다. 실제 서버 연결과 인증은 다음 단계에서 검증합니다.</p> : <><p>서버 연결 전입니다. 환경변수 없이도 기본 화면을 확인할 수 있습니다.</p><ul>{publicEnv.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="muted">설정 방법은 README와 .env.example을 참고해 주세요.</p></>}
    </aside>
  </>
}

export function App() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => { mainRef.current?.focus(); window.scrollTo(0, 0) }, [pathname])
  return <>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); mainRef.current?.focus() }}>본문으로 건너뛰기</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="작은 모임 시작 화면"><span className="brand-mark" aria-hidden="true">m.</span>{appConfig.name}</Link>
      <nav aria-label="주 메뉴"><NavLink to="/feed">피드</NavLink><NavLink to="/characters">캐릭터</NavLink><NavLink to="/login">로그인</NavLink></nav>
    </div></header>
    <main id="main" ref={mainRef} tabIndex={-1} className="page-container">
      <Routes><Route path="/" element={<Home />} />{pages.map(page => <Route key={page.path} path={page.path} element={<PlaceholderPage {...page} />} />)}
        <Route path="*" element={<section className="card placeholder"><span className="eyebrow">404</span><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 시작 화면으로 돌아가 주세요.</p><Link className="button" to="/">시작 화면으로</Link></section>} />
      </Routes>
    </main>
    <footer className="site-footer"><span>작은 모임 · mini-commu</span><span>서비스 준비 중</span></footer>
  </>
}
