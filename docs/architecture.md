# 구조와 단계 경계

브라우저에서 React + TypeScript 앱을 실행합니다. Vite가 만든 정적 결과물을 GitHub Pages에 배포하고, 인증·DB·비공개 파일은 Supabase가 담당합니다. GitHub Pages에 Node 서버를 실행하지 않습니다.

1단계에서는 앱 진입점과 화면 경로, 공통 설정을 준비합니다. URL 예시는 `/mini-commu/#/characters`이며 서버가 받는 경로는 `/mini-commu/`입니다. Vite `base`는 저장소 이름에 맞춰 `/mini-commu/`로 고정했습니다. 저장소 이름이 바뀌면 `vite.config.ts`와 사이트 URL 및 E2E 기본 주소를 함께 수정합니다.

등록한 경로: `/`, `/login`, `/signup`, `/reset-password`, `/auth/callback`, `/feed`, `/characters`, `/posts/new`, `/posts/:postId`, `/posts/:postId/edit`, `/activity`, `/exports`, `/settings`, `/admin`. 알 수 없는 해시 경로는 404 안내를 표시합니다. 현재 모든 기능 경로는 정적 안내만 반환합니다. 회원 정보와 API가 없으며 실제 기능을 연결할 때 라우트 가드와 서버 RLS를 함께 적용해야 합니다.

Supabase 클라이언트는 `src/lib/supabase.ts`에서 설정이 유효할 때만 생성합니다. 아직 이를 호출하는 기능은 없습니다. 세션 지속과 자동 갱신 옵션, PKCE 흐름을 준비했지만 로그인 지속 동작을 검증한 것은 아닙니다. 해시 라우터와 인증 처리를 분리하기 위해 자동 URL 감지는 끕니다. 3단계에서 콜백의 query code를 명시적으로 교환하고 가입 재개·비밀번호 복구를 구현합니다.

`shared/limits.json`은 클라이언트와 향후 서버의 정책 기준입니다. SQL 정책은 버전별 마이그레이션으로 적용하고 공통 값과의 일치를 테스트해야 합니다. 2단계에서는 SQL 마이그레이션과 DB/API 테스트를 추가했습니다. 기능별 쓰기 RPC와 프런트 연결은 다음 단계에서 구현합니다. 자세한 경계는 [DB 안내](database.md)를 따릅니다.

## 의존성 선택

2026-10-19 공식 문서의 설치 방식과 지원 조건을 확인하고, npm 레지스트리에서 제공하는 stable 버전을 설치했습니다. 실제 설치 버전의 기준은 `package.json`과 `pnpm-lock.yaml`입니다. 편집기와 데이터 캐시 라이브러리는 기능을 구현하는 단계에서 선정합니다.

- [React 버전](https://react.dev/versions)
- [Vite 시작과 Node 요구사항](https://vite.dev/guide/)
- [Node 지원 버전](https://nodejs.org/en/about/previous-releases)
- [React Router HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter)
- [Supabase 설치](https://supabase.com/docs/reference/javascript/installing)
- [Supabase 클라이언트 초기화](https://supabase.com/docs/reference/javascript/initializing)
