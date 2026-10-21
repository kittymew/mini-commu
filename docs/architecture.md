# 구조와 단계 경계

브라우저에서 React + TypeScript 앱을 실행합니다. Vite가 만든 정적 결과물을 GitHub Pages에 배포하고, 인증·DB·비공개 파일은 Supabase가 담당합니다. GitHub Pages에 Node 서버를 실행하지 않습니다.

1단계에서는 앱 진입점과 화면 경로, 공통 설정을 준비합니다. URL 예시는 `/mini-commu/#/characters`이며 서버가 받는 경로는 `/mini-commu/`입니다. Vite `base`는 저장소 이름에 맞춰 `/mini-commu/`로 고정했습니다. 저장소 이름이 바뀌면 `vite.config.ts`와 사이트 URL 및 E2E 기본 주소를 함께 수정합니다.

등록한 경로: `/`, `/login`, `/signup`, `/reset-password`, `/auth/callback`, `/feed`, `/characters`, `/posts/new`, `/posts/:postId`, `/posts/:postId/edit`, `/activity`, `/exports`, `/settings`, `/admin`, `/categories`. 알 수 없는 해시 경로는 404 안내를 표시합니다. 인증·가입·복구·계정 설정 경로는 실제 Auth와 연결되어 있습니다. 캐릭터·피드·일반글/투표글 작성·상세·수정·카테고리·내 활동·운영 경로는 실제 기능입니다. 피드 검색과 형식/공지/캐릭터 필터, 활성 회원의 PDF/JSON/이미지 ZIP 내보내기를 제공합니다. `/admin`은 운영자로 제한합니다. 서버 RLS는 화면과 별도로 모든 요청을 검사합니다.

Supabase 클라이언트는 `src/lib/supabase.ts`에서 설정이 유효할 때만 생성합니다. 세션 지속·자동 갱신과 PKCE를 사용하며, 해시 라우터와 충돌하지 않도록 자동 URL 감지는 끕니다. 앱 초기화 시 query의 인증 code를 메모리에 옮기고 URL을 지운 뒤 `/auth/callback`에서 명시적으로 교환합니다. 초대 코드와 비밀번호는 URL에 넣지 않습니다.

`src/features/auth/auth.ts`의 구독 가능한 상태 저장소가 Auth 이벤트와 `current_membership` 결과를 합칩니다. Auth 이벤트 콜백에서는 비동기 Auth 작업을 예약해 SDK 잠금과 충돌하지 않게 합니다. 네트워크 응답 세대 번호로 로그아웃·계정 전환 이전의 응답이 새 상태를 덮지 못하게 합니다. 회원 상태 조회 실패 시 보호 화면을 닫고 재시도를 제공합니다. 브라우저 포커스 복귀와 표시 중 15초 주기로 정지 상태를 재확인하며 실제 데이터 차단은 매 요청의 서버 RLS가 담당합니다.

로그아웃·계정 전환·정지 시 `mini-commu:` 이름공간의 초안·캐시·이미지 접근 정보를 정리하고 계정별 화면을 다시 마운트합니다. 향후 캐시와 이미지/초안 구현도 이 생명주기에 연결해야 합니다. 가입 중 초대 코드는 이메일에 묶어 sessionStorage에 보관해 24시간 이내 가입 재개에 사용하고 성공·로그아웃 시 지웁니다. 다른 브라우저/탭에서 보관값을 찾을 수 없으면 재입력합니다. 자세한 복귀 경로는 [인증 안내](auth.md)를 참고하세요.

`shared/limits.json`은 클라이언트와 향후 서버의 정책 기준입니다. SQL 정책은 버전별 마이그레이션으로 적용하고 공통 값과의 일치를 테스트해야 합니다. 2단계에서는 SQL 마이그레이션과 DB/API 테스트를 추가했습니다. 3단계에서 초대 가입 RPC와 인증 화면을 연결했고 나머지 쓰기는 해당 단계에서 구현합니다. 자세한 경계는 [DB 안내](database.md)를 따릅니다.

## 의존성 선택

2026-10-19 공식 문서의 설치 방식과 지원 조건을 확인하고, npm 레지스트리에서 제공하는 stable 버전을 설치했습니다. 실제 설치 버전의 기준은 `package.json`과 `pnpm-lock.yaml`입니다. 5단계 편집기는 제한된 JSON 문법과 React 텍스트 렌더러로 구현했으며 추가 편집기 라이브러리를 사용하지 않습니다.

- [React 버전](https://react.dev/versions)
- [Vite 시작과 Node 요구사항](https://vite.dev/guide/)
- [Node 지원 버전](https://nodejs.org/en/about/previous-releases)
- [React Router HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter)
- [Supabase 설치](https://supabase.com/docs/reference/javascript/installing)
- [Supabase 클라이언트 초기화](https://supabase.com/docs/reference/javascript/initializing)

## 4단계 캐릭터 상태와 이미지

`CharacterProvider`가 회원별 목록과 기기별 선택을 관리합니다. 인증 화면의 마운트를 유지하면서 계정/복구 상태가 변하면 데이터만 비우므로 비밀번호 변경 완료 안내가 사라지지 않습니다. 늦은 응답과 선택 저장은 현재 인증 계정까지 확인합니다. 캐릭터 화면은 지연 로딩해 초기 번들 크기를 제한합니다.

프로필은 `profile-image`의 동일 처리 함수를 로컬 Node HTTP 어댑터와 클라우드 Deno 진입점에서 사용합니다. 실제 업로드는 서버 키로 처리하며 브라우저 Storage 쓰기 권한은 열지 않습니다. 처리 완료된 자산만 캐릭터가 참조할 수 있습니다. 세부 제한과 스냅샷 트리거는 [캐릭터 안내](characters.md)에 정리합니다.

## 5단계 콘텐츠

피드/작성기/상세/카테고리를 지연 로딩합니다. 본문은 텍스트 노드와 제한된 서식만 저장하며 React 요소로 렌더링합니다. `useResource`는 요청 세대·현재 계정을 확인하고 포커스 복귀/15초 주기로 서버 상태를 갱신합니다. 초안은 계정별 localStorage, 미완료 업로드 미리보기는 메모리 Blob URL로 관리합니다. SQL RPC가 소유권·스냅샷·버전·첨부 순서를 한 트랜잭션으로 검사합니다. [콘텐츠 설계](posts.md)를 참고하세요.

## 6단계 투표와 운영

투표 원본은 비공개 스키마에 두고 공개 시점별 DTO만 반환합니다. 게시글 잠금으로 참여·설정 변경·마감을 직렬화합니다. 검색·공지·고정은 `browse_posts`, 계정별 활동은 `list_my_activity`를 사용하며 모두 정상 공개 상태만 조회합니다. 운영 UI는 별도 회원/기록/숨김 메타데이터 RPC와 기존 초대/역할 API를 연결합니다. 자세한 동작은 [6단계 안내](community.md)에 정리했습니다.

## 7단계 내보내기

`/exports`를 지연 로딩하며 200개 커서로 대상 목록을 수집한 뒤 한 분할씩 준비합니다. SQL의 명시적 공개 DTO와 체크섬 재검사로 회원 권한과 공개 범위를 유지합니다. fflate의 취소 가능한 비동기 ZIP과 실제 인증 이미지 바이트를 사용하며, PDF는 자체 호스팅 Noto Sans KR을 로딩한 브라우저 인쇄 화면으로 만듭니다. 파일·Blob URL은 메모리에만 유지하고 세션 변경 때 해제합니다. [범위와 한계](exports.md)를 참고하세요.
