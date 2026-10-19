# 1단계 검증 기록

검증일: 2026-10-19 (Asia/Seoul)

## 통과한 항목

| 항목 | 실행 및 결과 |
| --- | --- |
| 잠금 파일 설치 | `pnpm install --frozen-lockfile` 성공 |
| 의존성 호환 | `pnpm peers check` — 문제 없음 |
| TypeScript | `pnpm typecheck` (`pnpm check`에 포함) 성공 |
| 린트 | `pnpm lint` — 경고·오류 없음 |
| 프로덕션 빌드 | `pnpm build` — Vite 8.3.4, `dist/` 생성 |
| 개발 서버 | `pnpm dev --port 5173 --strictPort` 실행 및 앱 내 브라우저 확인 |
| E2E | `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` — 6개 통과 |
| 환경 파일 제외 | `git check-ignore`로 `.env.local`, `.env.production`, `node_modules`, `dist` 제외 확인 |

E2E는 실제 프로덕션 빌드의 `/mini-commu/` 경로에서 3개 시나리오를 데스크톱과 Pixel 7 화면 크기로 각각 실행했습니다.

1. Supabase 미설정 안내, 캐릭터 경로 이동과 본문 포커스, 시작 화면 복귀, 가로 넘침 없음, 브라우저 런타임 오류 없음.
2. `#/login`, `#/posts/example`, `#/auth/callback` 직접 접속 및 새로고침 후 같은 화면 유지.
3. 없는 경로에서 404 안내와 시작 화면 복귀.

검증 환경: macOS, Node 24.19.0, pnpm 11.25.0, 로컬 Google Chrome. 네트워크 설치와 로컬 서버 실행은 도구의 승인된 접근으로 진행했습니다.

## 확인 과정에서 수정한 항목

- 최신 TypeScript 7은 typescript-eslint 지원 범위 밖이어서 TypeScript 6.0.3으로 고정했습니다. 최종 설치에는 peer dependency 문제가 없습니다.
- E2E의 브라우저 콜백 타입 검사를 위해 테스트 설정에 DOM 라이브러리를 포함했습니다.

## 미실행 및 후속 검증

- A24 중 타입 검사·린트·빌드·로컬 하위 경로 라우팅을 확인했습니다. 실제 GitHub Pages 배포 경로 검증은 아직 수행하지 않았습니다.
- GitHub Actions는 최초 푸시 시 실행하도록 구성했습니다. 이 기록의 결과는 로컬 실행 기준입니다.
- Supabase 외부 프로젝트 및 로컬 DB는 연결하지 않았습니다. 스키마·RLS가 없는 1단계이므로 데이터 흐름 검증은 2단계부터 진행합니다.
- 인증, 이메일 콜백의 실제 토큰 처리, 비밀번호 재설정, 세션 지속, 권한, 동시성, CRUD, 이미지, 내보내기는 아직 구현하거나 검증하지 않았습니다.
- 모바일 검증은 화면 크기 에뮬레이션입니다. 실제 기기 및 Safari 검증은 후속 단계에서 진행합니다.
- 실제 배포, 운영 백업 및 외부 저장소 연결은 수행하지 않았습니다.
