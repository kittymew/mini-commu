# mini-commu · 작은 모임

초대제로 운영하는 캐릭터 프로필 커뮤니티입니다. 요구사항의 기준은 [구현 작업 명세서](커뮤니티_구현_작업명세서.md)입니다.

현재 **1단계: 프로젝트 기반 준비**까지 구현했습니다. 화면은 기능별 자리표시자이며 회원 가입, 로그인, DB 조회·저장, 권한 검사는 아직 구현하지 않았습니다. 샘플 회원이나 게시글을 실제 데이터처럼 보여주지 않습니다.

## 개발 환경

- Node.js 24 LTS (`.nvmrc`), pnpm 11.25.0 (`packageManager`)
- Node 설치 후 `npm install --global pnpm@11.25.0`으로 동일한 패키지 매니저를 설치합니다.
- 의존성은 `package.json`에 정확한 버전, `pnpm-lock.yaml`에 전이 의존성까지 고정합니다.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

개발 주소는 `http://127.0.0.1:5173/mini-commu/`입니다. 포트가 사용 중이면 터미널에 출력된 주소를 사용합니다. Supabase 값은 아직 비워 두어도 화면을 확인할 수 있습니다. 실제 키가 없으면 Supabase 클라이언트를 만들지 않으며, 시작 화면에 설정 안내를 표시합니다.

이 작업 컴퓨터는 Node/pnpm이 기본 PATH에 없어 Codex 제공 런타임(Node 24)을 사용해 검증했습니다. 일반 터미널에서 실행하려면 위 개발 도구를 설치하고 PATH에 등록해야 합니다. 저장소 자체는 Codex 런타임에 의존하지 않습니다.

## 명령

| 명령 | 역할 |
| --- | --- |
| `pnpm dev` | 로컬 개발 서버 |
| `pnpm typecheck` | 앱·설정·테스트 TypeScript 검사 |
| `pnpm lint` | ESLint 검사, 경고도 실패 처리 |
| `pnpm build` | 타입 검사 후 프로덕션 `dist/` 생성 |
| `pnpm check` | 린트 및 프로덕션 빌드 |
| `pnpm preview` | `http://127.0.0.1:4173/mini-commu/`에서 빌드 확인 |
| `pnpm test:e2e` | 프로덕션 빌드의 해시 라우팅·새로고침·오류 경로 검사 |

E2E는 Supabase 값이 없는 기본 환경에서 실행합니다. 먼저 `pnpm build`와 `pnpm exec playwright install chromium`을 실행합니다. 설치된 Chrome을 사용하려면 `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`도 가능합니다. 테스트는 데스크톱과 모바일 화면 크기에서 실행하며 실제 모바일 기기 검증은 별도입니다.

## 환경변수

| 변수 | 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_`로 시작하는 공개용 키 |
| `VITE_SITE_URL` | 해시·쿼리 없는 사이트 기본 URL. 개발 예시는 `.env.example` 참고 |

환경변수 변경 후 개발 서버를 재시작하거나 다시 빌드합니다. `VITE_` 값은 빌드 결과와 브라우저에서 누구나 볼 수 있습니다. `service_role`, `sb_secret_`, DB 비밀번호는 넣지 않습니다. `.env.local`과 다른 실제 환경 파일은 Git에서 제외합니다. 클라이언트 설정 검사는 비밀을 넣어도 된다는 뜻이 아니며, 이전 방식의 JWT anon 키는 현재 입력 형식에서 지원하지 않습니다.

## 구성과 기본값

- `src/app`: 전역 레이아웃과 `HashRouter` 경로 구성
- `src/components`, `src/styles`: 공통 화면과 반응형 스타일
- `src/features/*`: 이후 단계의 기능 구현 위치
- `src/lib`: 환경변수, Supabase 초기화, 앱 공통 설정
- `src/types`: 2단계 이후 실제 DB에서 생성할 타입 위치
- `shared/limits.json`: 캐릭터 6개, 글 이미지 4장, 글자 수, 입력 이미지 10 MiB, 피드 20개, 내보내기 200개, 투표·초대 기본값, Asia/Seoul 표시 시간대
- `supabase/{migrations,functions,tests}`: 2단계부터 구현할 서버 영역
- `tests/e2e`: 1단계 브라우저 검증

제한값은 `shared/limits.json`을 기준으로 관리합니다. 현재 서버는 없으므로 서버에서 강제하는 제한은 아직 없습니다. 2단계 이후 SQL·서버 구현 시 이 파일에서 제한값을 반영하고 일치 검증을 추가합니다. 본문의 Unicode 코드 포인트 계산, 이미지 변환 후 저장 한도·축소 크기 등 기능별 검증은 해당 구현 단계에서 완성합니다.

## 다음 단계와 배포

2단계는 SQL 스키마, 회원 역할·상태, RLS와 비공개 데이터 경계, 최초 운영자 설정입니다. 3단계부터 인증을 연결합니다. 현재 인증 콜백 경로는 자리표시자이며 이메일 링크의 토큰 교환은 수행하지 않습니다.

저장소: <https://github.com/kittymew/mini-commu>

GitHub Pages 배포 예정 주소: <https://kittymew.github.io/mini-commu/>. 1단계에서는 실제 Pages 배포를 수행하지 않습니다. 현재 워크플로는 검사만 수행합니다.

자세한 내용: [설계](docs/architecture.md), [배포](docs/deployment.md), [운영](docs/operations.md), [검증](docs/verification.md).
