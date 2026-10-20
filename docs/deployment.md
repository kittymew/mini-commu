# 배포 준비

현재 3단계 인증 기능을 로컬에서 검증했습니다. GitHub Pages 활성화와 실제 배포는 아직 수행하지 않았습니다. `.github/workflows/ci.yml`은 검증만 수행하고 게시하지 않습니다.

- 저장소: `kittymew/mini-commu` (public)
- 기본 브랜치: `main`
- 예정 주소: `https://kittymew.github.io/mini-commu/`
- Vite base: `/mini-commu/`
- 결과물: `dist/`

## 이후 배포 단계에서 할 일

1. Supabase 프로젝트에 SQL 마이그레이션과 서버 함수를 먼저 적용합니다.
2. 공개용 URL·publishable key와 사이트 URL을 빌드 환경에 설정합니다.
3. GitHub 저장소 Settings → Pages에서 GitHub Actions를 배포 소스로 설정합니다.
4. 잠금 파일 설치, 타입 검사·린트·테스트·빌드를 통과한 결과만 Pages에 배포하도록 워크플로를 추가합니다.
5. Supabase Auth의 Site URL과 redirect 허용 목록에 실제 개발·배포 콜백 주소를 설정합니다. 기본 URL을 `https://kittymew.github.io/mini-commu/`로 정확히 지정합니다. 인증 메일은 기본 `ConfirmationURL`을 사용하며 `?code=...`를 앱이 교환하고 `#/auth/callback`으로 정리합니다. 개발 주소는 `http://127.0.0.1:5173/mini-commu/`입니다.
6. Auth에서 이메일 인증을 켜고 비밀번호 최소 길이를 8자로 맞춥니다. Free 프로젝트에서도 외부 사용자에게 메일을 보내려면 별도의 SMTP 공급자 설정이 필요합니다. 로컬 테스트의 Auth 요청 한도를 운영에 복사하지 않습니다.
7. 실제 배포 주소에서 직접 링크·새로고침 및 인증 복귀를 다시 검증합니다.

로컬 브라우저 검증은 저장소 하위 경로로 빌드한 결과에 대한 검증이며 실제 GitHub Pages 호스팅 검증을 대신하지 않습니다. 운영 환경에서 DB 초기화나 로컬 시드를 자동 실행하지 않습니다.

참고: [Vite GitHub Pages 안내](https://vite.dev/guide/static-deploy.html#github-pages), [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys).

## 2단계 추가 사항

SQL 마이그레이션과 권한 정책은 로컬 Supabase에서 검증했습니다. 클라우드 연결·SQL 적용은 아직 수행하지 않았습니다. 무료 플랜에 새 프로젝트를 만들 때 Data API 노출 스키마를 `public`으로 제한하고 자동 신규 객체 권한 부여를 끕니다. `private`는 노출하지 않습니다. 마이그레이션 자체에서도 RLS와 명시적 권한 회수를 적용합니다.

운영 배포는 마이그레이션 적용 절차로 수행하고 `db:reset`이나 테스트 픽스처를 실행하지 않습니다. GitHub Actions의 DB 작업은 CI 내부 로컬 서비스에서만 실행하며 원격 Supabase 비밀값을 요구하지 않습니다.
