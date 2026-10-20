# 구조와 단계 경계

브라우저에서 React + TypeScript 앱을 실행합니다. Vite가 만든 정적 결과물을 GitHub Pages에 배포하고, 인증·DB·비공개 파일은 Supabase가 담당합니다. GitHub Pages에 Node 서버를 실행하지 않습니다.

1단계에서는 앱 진입점과 화면 경로, 공통 설정을 준비합니다. URL 예시는 `/mini-commu/#/characters`이며 서버가 받는 경로는 `/mini-commu/`입니다. Vite `base`는 저장소 이름에 맞춰 `/mini-commu/`로 고정했습니다. 저장소 이름이 바뀌면 `vite.config.ts`와 사이트 URL 및 E2E 기본 주소를 함께 수정합니다.

등록한 경로: `/`, `/login`, `/signup`, `/reset-password`, `/auth/callback`, `/feed`, `/characters`, `/posts/new`, `/posts/:postId`, `/posts/:postId/edit`, `/activity`, `/exports`, `/settings`, `/admin`. 알 수 없는 해시 경로는 404 안내를 표시합니다. 인증·가입·복구·계정 설정 경로는 실제 Auth와 연결되어 있습니다. 콘텐츠 경로는 활성 회원만 볼 수 있는 안내 화면이며 `/admin`은 운영자로 제한합니다. 서버 RLS는 화면과 별도로 모든 요청을 검사합니다.

Supabase 클라이언트는 `src/lib/supabase.ts`에서 설정이 유효할 때만 생성합니다. 세션 지속·자동 갱신과 PKCE를 사용하며, 해시 라우터와 충돌하지 않도록 자동 URL 감지는 끕니다. 앱 초기화 시 query의 인증 code를 메모리에 옮기고 URL을 지운 뒤 `/auth/callback`에서 명시적으로 교환합니다. 초대 코드와 비밀번호는 URL에 넣지 않습니다.

`src/features/auth/auth.ts`의 구독 가능한 상태 저장소가 Auth 이벤트와 `current_membership` 결과를 합칩니다. Auth 이벤트 콜백에서는 비동기 Auth 작업을 예약해 SDK 잠금과 충돌하지 않게 합니다. 네트워크 응답 세대 번호로 로그아웃·계정 전환 이전의 응답이 새 상태를 덮지 못하게 합니다. 회원 상태 조회 실패 시 보호 화면을 닫고 재시도를 제공합니다. 브라우저 포커스 복귀와 표시 중 15초 주기로 정지 상태를 재확인하며 실제 데이터 차단은 매 요청의 서버 RLS가 담당합니다.

로그아웃·계정 전환·정지 시 `mini-commu:` 이름공간의 초안·캐시·이미지 접근 정보를 정리하고 계정별 화면을 다시 마운트합니다. 향후 캐시와 이미지/초안 구현도 이 생명주기에 연결해야 합니다. 가입 중 초대 코드는 이메일에 묶어 sessionStorage에 보관해 24시간 이내 가입 재개에 사용하고 성공·로그아웃 시 지웁니다. 다른 브라우저/탭에서 보관값을 찾을 수 없으면 재입력합니다. 자세한 복귀 경로는 [인증 안내](auth.md)를 참고하세요.

`shared/limits.json`은 클라이언트와 향후 서버의 정책 기준입니다. SQL 정책은 버전별 마이그레이션으로 적용하고 공통 값과의 일치를 테스트해야 합니다. 2단계에서는 SQL 마이그레이션과 DB/API 테스트를 추가했습니다. 3단계에서 초대 가입 RPC와 인증 화면을 연결했고 나머지 쓰기는 해당 단계에서 구현합니다. 자세한 경계는 [DB 안내](database.md)를 따릅니다.

## 의존성 선택

2026-10-19 공식 문서의 설치 방식과 지원 조건을 확인하고, npm 레지스트리에서 제공하는 stable 버전을 설치했습니다. 실제 설치 버전의 기준은 `package.json`과 `pnpm-lock.yaml`입니다. 편집기와 데이터 캐시 라이브러리는 기능을 구현하는 단계에서 선정합니다.

- [React 버전](https://react.dev/versions)
- [Vite 시작과 Node 요구사항](https://vite.dev/guide/)
- [Node 지원 버전](https://nodejs.org/en/about/previous-releases)
- [React Router HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter)
- [Supabase 설치](https://supabase.com/docs/reference/javascript/installing)
- [Supabase 클라이언트 초기화](https://supabase.com/docs/reference/javascript/initializing)
