# 배포 설정과 실행 절차

8단계에서 검증 후 GitHub Pages 배포하는 워크플로를 추가했습니다. **현재 클라우드 Supabase와 Pages는 미배포**입니다. 저장소의 Actions 변수·비밀 이름을 조회했으며 연결값이 없었습니다. `ENABLE_PAGES_DEPLOY`도 설정하지 않아 이번 푸시는 검증만 실행합니다.

- 저장소/브랜치: `kittymew/mini-commu`, `main`
- 배포 주소: `https://kittymew.github.io/mini-commu/`
- Vite base: `/mini-commu/`, 해시 경로 예: `#/posts/<ID>`
- 결과물: `dist/` (DB, 서버 함수, 환경 파일, 테스트 데이터는 포함하지 않음)

## 검증과 배포 순서

`.github/workflows/ci.yml`의 `check`와 `database` 작업은 PR/main push/수동 실행에서 동작합니다. 잠금 파일 설치, Edge WASM 준비, 배포 설정 테스트, 린트·타입·빌드, Chromium 데스크톱/모바일 및 WebKit 모바일 기본 경로, 실제 로컬 DB/API·동시성·Auth E2E, Deno Edge JWT/이미지/Storage 통합과 SQL/type 검사를 수행합니다. CI의 DB와 메일함은 로컬 테스트 전용입니다.

`pages` 작업은 **두 검증 작업 성공 + main + PR이 아님 + ENABLE_PAGES_DEPLOY=true**인 경우에만 실행합니다. 같은 커밋을 체크아웃해 운영 공개 설정을 검사하고 다시 빌드한 뒤 Pages 아티팩트를 배포합니다. 액션은 커밋 SHA에 고정하고 Pages/OIDC 쓰기 권한은 해당 작업에만 줍니다. `github-pages` environment에서 main만 허용하도록 설정하세요. 배포 후 `pnpm smoke:pages`가 실제 HTML과 프로젝트 하위 경로의 JS/CSS 응답을 확인합니다. 이 검사는 계정 인증·메일 복귀 검증을 대체하지 않습니다.

## 1. Supabase Free 백엔드 먼저 준비

프로젝트 ref, 관리용 로그인/DB 접근, 프로젝트 HTTPS URL과 publishable key가 필요합니다. 비밀값은 채팅·Git·브라우저 환경변수 대신 신뢰된 CLI/대시보드에 입력합니다. 아래는 실제 프로젝트 연결 후 실행할 명령이며 이번 단계에서 원격 실행하지 않았습니다.

```sh
pnpm install --frozen-lockfile
pnpm exec supabase login
pnpm exec supabase link --project-ref <PROJECT_REF>
pnpm exec supabase migration list --linked
pnpm exec supabase db push --linked --dry-run
# 적용 대상/백업 확인 후 실행
pnpm exec supabase db push --linked
```

기존 데이터가 있다면 [DB·Storage 별도 백업](operations.md#dbstorage-백업과-복원)을 먼저 수행합니다. `db:reset`, 로컬 시드, 테스트 계정 생성 명령을 운영에 실행하지 않습니다. 자동 신규 객체 권한을 끄고 Data API 노출 스키마는 `public`으로 제한합니다. `private`는 노출하지 않습니다. 버킷 `community`는 비공개이며 브라우저 쓰기 권한을 열지 않습니다. [마이그레이션 절차](https://supabase.com/docs/guides/deployment/database-migrations)를 따릅니다.

## 2. 이미지 Edge 함수

```sh
pnpm edge:prepare
pnpm exec supabase secrets set APP_ORIGINS=https://kittymew.github.io --project-ref <PROJECT_REF>
pnpm exec supabase functions deploy profile-image --project-ref <PROJECT_REF>
pnpm exec supabase functions deploy post-image --project-ref <PROJECT_REF>
```

`edge:prepare`는 잠금 파일의 ImageMagick 패키지에서 유효한 WASM을 추출해 `supabase/functions/_shared/magick.wasm`에 씁니다. 생성 바이너리는 Git에서 제외하며 매 배포 전에 생성합니다. 두 함수는 상대경로로 읽고 `config.toml`의 `static_files`로 함께 패키징합니다. [WASM 배포 안내](https://supabase.com/docs/guides/functions/wasm)에 따라 Docker 번들링 가능한 환경에서 실행하고, 정적 파일을 제외하는 `--use-api` 배포는 사용하지 않습니다.

함수의 `verify_jwt=false`는 공개 업로드 허용을 뜻하지 않습니다. 처리 함수가 Bearer 토큰을 Auth `getUser`로 검증하고 활성 회원·예약 자산 소유권을 검사합니다. 서버의 Supabase URL/anon/service 역할 환경은 플랫폼 주입값을 사용합니다. 서비스 키를 프런트엔드에 넣지 않습니다. `APP_ORIGINS`는 경로 없는 origin입니다.

공개 전 실제 Deno/Edge 번들의 시작, CORS와 미인증 거부, 작은 이미지·최대 입력 처리, 정지 중 업로드, 실패 후 자산 정리를 확인합니다. Free CPU/메모리/번들 한도에서 실패하면 배포를 보류하고 처리 크기·구현을 조정합니다. 자동 유료 업그레이드나 유료 이미지 변환은 사용하지 않습니다. 로컬 Node와 Deno Edge에서 작은 이미지 변환·Storage 저장을 확인했지만 클라우드 자원 한도 보증은 아닙니다. macOS native Edge 런타임은 CPU 타이머가 비활성화되어 있습니다.

## 3. Auth와 메일

- Site URL: `https://kittymew.github.io/mini-commu/`
- Redirect 허용 목록: 위 주소를 정확하게 추가합니다. 개발용은 `http://127.0.0.1:5173/mini-commu/`와 실제 사용하는 개발 주소만 별도로 추가합니다.
- 인증/복구 리디렉션은 기본 URL로 요청하며 `?code=...`를 교환한 뒤 `#/auth/callback` 경로를 사용합니다. wildcard나 임의 외부 redirect를 추가하지 않습니다.
- 이메일 인증을 켜고 비밀번호 최소 8자, 기본 `ConfirmationURL` 메일 템플릿을 사용합니다.
- 외부 사용자용 SMTP와 발신 주소/도메인을 설정하고 공급자의 무료 범위·발송 제한을 확인합니다. 로컬 Mailpit은 실제 메일 발송이 아닙니다. 로컬/CI의 높은 Auth 요청 한도를 운영에 복사하지 않습니다.

[Redirect 안내](https://supabase.com/docs/guides/auth/redirect-urls)와 [SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)를 참고하세요.

## 4. GitHub Pages 활성화

Settings → Pages의 Source를 **GitHub Actions**로 지정합니다. Actions Variables에 다음을 설정합니다.

| 변수 | 값/역할 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<20자리 PROJECT_REF>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 해당 프로젝트의 `sb_publishable_...` 공개 키 |
| `ENABLE_PAGES_DEPLOY` | 백엔드·함수·Auth 설정 검증 후 `true` |

`VITE_SITE_URL`은 워크플로에 위 Pages 주소로 고정합니다. `pnpm build:pages`는 셸 변수와 Vite의 production 환경 파일을 함께 읽어 누락값, secret/legacy 키, 로컬·HTTP·다른 호스트, 잘못된 사이트 경로, 별도 업로드 주소와 미등록 `VITE_` 변수를 거부합니다. 오류에 입력값은 출력하지 않습니다. 커스텀 Supabase 도메인을 쓸 경우 검사 정책부터 변경해야 합니다.

Free Supabase 사용에는 프런트엔드 저장소 비밀 키가 필요하지 않습니다. 배포를 활성화하면 이후 main push의 검증 성공 시 자동 배포되고, Actions 수동 실행도 main에서 같은 검증을 거칩니다. 미설정 안내 화면을 운영 서비스로 배포하지 않습니다.

## 5. 공개 주소 인수 확인

실제 배포 후 별도 일반 회원 2명·운영자·미가입/정지 계정으로 다음을 확인하고 [인수표](acceptance.md)에 날짜·환경을 기록합니다.

1. `/mini-commu/`, `#/login`, `#/posts/<ID>`, `#/exports` 직접 접속과 새로고침.
2. 가입 인증/복구 메일의 정확한 Pages 복귀, 같은 브라우저 PKCE, 다른 브라우저 재로그인 안내.
3. 이미지 업로드·조회, CORS, 숨김/정지 후 서버 거부, 공개 데이터의 계정 ID/이메일 비노출.
4. 데스크톱과 실제 iPhone/Android에서 작성·편집·투표·ZIP 다운로드와 PDF 저장.
5. 최초 운영자·초대 절차, 백업 복원 시험, 임시 파일 정리 스케줄과 실패 알림, Free 사용량 점검.

## 장애와 되돌리기

실패한 검증은 배포를 건너뜁니다. 배포 후 smoke 실패는 실패 실행으로 남지만 이미 공개된 파일을 자동 복구하지는 않습니다. `ENABLE_PAGES_DEPLOY=false`는 **향후 배포만** 멈추며 공개 사이트를 내리지는 않습니다. 공개 중단은 Pages 설정에서 별도로 수행합니다.

문제가 있는 프런트엔드는 정상 커밋으로 되돌리는 커밋을 main에 올려 검증 후 다시 배포합니다. DB는 프런트엔드 되돌리기로 복구되지 않습니다. 호환되는 추가 마이그레이션을 우선하고, 데이터 복원이 필요하면 백업 절차로 격리 환경에서 먼저 시험합니다. 앱과 백엔드 버전·백업 ID·배포 실행 URL을 운영 기록에 남깁니다.

공식 워크플로 참고: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
